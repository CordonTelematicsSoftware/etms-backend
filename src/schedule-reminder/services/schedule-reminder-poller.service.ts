import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, Sequelize } from 'sequelize';
import * as moment from 'moment';

import { ScheduleReminderSchedule } from '../models/schedule-reminder-schedule.model';
import { ScheduleReminderService } from './schedule-reminder.service';
import { ScheduleReminderGeneratorService } from './schedule-reminder-generator.service';
import { CutoffLeg } from '../utils/cutoff-deadline.util';
import { parseHourlyCutoff, shiftInstant } from '../utils/hourly-cutoff.util';

/**
 * Every 10 minutes.
 *
 * The reminder buffer must exceed this interval, or a row whose runAt falls
 * just after a tick waits nearly a full interval and the push can land at or
 * after the deadline. DEFAULT_BUFFER_MINUTES of 20 clears 10 with margin.
 *
 * MIN_BUFFER_MINUTES of 1 does NOT. That is a deliberate degradation, not a
 * failure: a buffer below the poll interval means "fire at the next tick",
 * which may be after the deadline, and the row is then dropped by runOne's
 * closesAt check rather than sending a useless push.
 */
const CRON_EXPRESSION = '*/10 * * * *';
const POLLER_FLAG = 'SCHEDULE_REMINDER_HOURLY_ENABLED';

/** Rows handled per tick. Bounds the blast radius of a bad generation run. */
const BATCH_SIZE = 50;

/**
 * How long a 'running' row may sit before another process may take it over.
 *
 * A process that dies between claim() and finish() leaves the row 'running'
 * forever: the poller only looked for 'pending', and the nightly rebuild's
 * destroy only targets 'pending' too, so bulkCreate's ignoreDuplicates silently
 * discarded the replacement row against the (orgID, teamID, leg, shiftTime,
 * tripDate) unique index. That instant was lost until prune() removed it.
 *
 * 30 minutes because the threshold has to exceed the longest LEGITIMATE run,
 * and one row is a full org sweep: 2500 employees paginate 500 at a time, and
 * every employee actually reminded costs a ledger insert, two dispatcher config
 * reads, a NotificationLogs insert and two updates — minutes of serial queries.
 * Too short and two processes dispatch the same instant concurrently; the
 * ledger's unique constraint would still stop a duplicate push, but the second
 * process would redo the whole sweep for nothing.
 */
const STALE_CLAIM_MINUTES = 30;

/**
 * Failures after which a row is abandoned as 'skipped' rather than retried.
 *
 * The batch is ORDER BY "runAt" ASC LIMIT 50 and a failed row keeps its runAt,
 * so without a cap a persistently failing row sorts to the head of every tick
 * forever and the rows behind it are never reached. Five spreads the retries
 * over roughly an hour of ticks, which clears a transient DB blip, and then
 * gives up loudly instead of silently blocking the queue.
 */
const MAX_ATTEMPTS = 5;

@Injectable()
export class ScheduleReminderPollerService {
  private readonly logger = new Logger(ScheduleReminderPollerService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(ScheduleReminderSchedule)
    private readonly scheduleModel: typeof ScheduleReminderSchedule,
    private readonly reminderService: ScheduleReminderService,
    private readonly generator: ScheduleReminderGeneratorService,
  ) {}

  @Cron(CRON_EXPRESSION)
  async handlePoll(): Promise<void> {
    if (process.env[POLLER_FLAG] !== 'true') {
      return;
    }

    const now = moment();

    // 'pending', plus 'running' rows whose claiming process never came back.
    // See STALE_CLAIM_MINUTES for why those are otherwise lost outright.
    const staleClaimBefore = now
      .clone()
      .subtract(STALE_CLAIM_MINUTES, 'minutes')
      .toDate();

    const due = await this.scheduleModel.findAll({
      where: {
        runAt: { [Op.lte]: now.toDate() },
        // Exhausted rows can never be re-selected, even if something outside
        // this service flips one back to 'pending'.
        attempts: { [Op.lt]: MAX_ATTEMPTS },
        [Op.or]: [
          { status: 'pending' },
          { status: 'running', claimedAt: { [Op.lt]: staleClaimBefore } },
        ],
      },
      order: [['runAt', 'ASC']],
      limit: BATCH_SIZE,
    });

    if (due.length === 0) {
      return;
    }

    // Cached per tick: several rows usually share an org.
    const overrideTeamCache = new Map<string, bigint[]>();
    let sent = 0;
    let skipped = 0;

    for (const row of due) {
      const claimed = await this.claim(row.id);
      if (!claimed) {
        // Another process won the row. Not an error.
        continue;
      }

      try {
        const result = await this.runOne(row, now, overrideTeamCache);
        if (result === null) {
          skipped += 1;
        } else {
          sent += result;
        }
        await this.finish(row.id, 'done', null);
      } catch (error) {
        // Contain at the row: one bad org must not stall the queue.
        const message = String(error?.message ?? error).slice(0, 250);
        const attempts = (row.attempts ?? 0) + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;

        await this.finish(
          row.id,
          exhausted ? 'skipped' : 'pending',
          message,
          attempts,
        );

        if (exhausted) {
          this.logger.warn(
            `hourly reminder row ${row.id} SKIPPED after ${attempts} attempts — ` +
              `org ${row.orgID}${row.teamID ? ` team:${row.teamID}` : ''} ` +
              `${row.tripDate} ${row.shiftTime} [${row.leg}]: ${message}`,
          );
        } else {
          this.logger.error(
            `hourly reminder row ${row.id} failed ` +
              `(attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`,
            error?.stack,
          );
        }
      }
    }

    this.logger.log(
      `Hourly poll: due=${due.length} sent=${sent} skipped=${skipped}`,
    );
  }

  /**
   * Claim a row, atomically.
   *
   * There is no advisory lock or leader election anywhere in this codebase,
   * and exec_mode "cluster" plus warm Lambda containers means several
   * processes hold live cron timers. The conditional UPDATE is the only thing
   * standing between a due row and a duplicate push: whichever process flips
   * 'pending' to 'running' wins, and the rest get zero rows back.
   *
   * Same shape as sendReminder's claim-first ledger insert.
   *
   * A stale 'running' row is claimable too, on the same terms — the conditional
   * UPDATE is still the arbiter, so exactly one process wins it and the rest
   * get zero rows back. The interval is bound from STALE_CLAIM_MINUTES rather
   * than written inline, so this predicate cannot drift from the one that
   * selected the row in handlePoll.
   */
  private async claim(id: bigint): Promise<boolean> {
    const [, affected] = await this.sequelize.query(
      `UPDATE "ScheduleReminderSchedules"
          SET "status" = 'running', "claimedAt" = now(), "updatedAt" = now()
        WHERE "id" = :id
          AND ("status" = 'pending'
               OR ("status" = 'running'
                   AND "claimedAt" < now() - (:staleMinutes * interval '1 minute')))`,
      {
        replacements: { id: String(id), staleMinutes: STALE_CLAIM_MINUTES },
        type: QueryTypes.UPDATE,
      },
    );

    return Number(affected ?? 0) > 0;
  }

  private async finish(
    id: bigint,
    status: 'done' | 'pending' | 'skipped',
    error: string | null,
    attempts?: number,
  ): Promise<void> {
    const values: any = { status, error, finishedAt: new Date() };
    if (attempts !== undefined) {
      values.attempts = attempts;
    }

    await this.scheduleModel.update(values, { where: { id } });
  }

  /** Returns reminders sent, or null when the row no longer applies. */
  private async runOne(
    row: ScheduleReminderSchedule,
    now: moment.Moment,
    overrideTeamCache: Map<string, bigint[]>,
  ): Promise<number | null> {
    // Re-resolve the cutoff at fire time. The row was generated up to 7 days
    // ago and an admin may have changed the config since; the regeneration
    // hooks cover the common cases but direct DB edits bypass them.
    const config = await this.reminderService.readOrgConfigValues(row.orgID, [
      row.leg === 'pick' ? 'PICKUP_SCHEDULE_CUTOFF' : 'DROP_SCHEDULE_CUTOFF',
    ]);

    const configValue =
      row.leg === 'pick'
        ? config['PICKUP_SCHEDULE_CUTOFF']
        : config['DROP_SCHEDULE_CUTOFF'];

    const cutoff = parseHourlyCutoff(configValue);
    if (cutoff.ok !== true) {
      this.logger.log(
        `row ${row.id}: skipped — ${(cutoff as { reason: string }).reason}`,
      );
      return null;
    }

    const shiftAt = shiftInstant(row.tripDate, row.shiftTime);
    if (!shiftAt) {
      return null;
    }

    const closesAt = shiftAt.clone().subtract(cutoff.lower, 'hours');
    if (!closesAt.isAfter(now)) {
      // Deadline passed between generation and this tick — nothing to remind.
      return null;
    }

    let excludeTeamIDs: bigint[] = [];
    if (!row.teamID) {
      const key = String(row.orgID);
      if (!overrideTeamCache.has(key)) {
        overrideTeamCache.set(
          key,
          await this.generator.resolveOverrideTeamIDs(row.orgID),
        );
      }
      excludeTeamIDs = overrideTeamCache.get(key) ?? [];
    }

    const result = await this.reminderService.remindHourlyTarget({
      orgID: row.orgID,
      teamID: row.teamID,
      leg: row.leg as CutoffLeg,
      shiftTime: row.shiftTime,
      tripDate: row.tripDate,
      cutoffAt: closesAt.toDate(),
      excludeTeamIDs,
    });

    if (!result) {
      return null;
    }

    this.logger.log(
      `  org ${row.orgID}${row.teamID ? ` team:${row.teamID}` : ''} ` +
        `[${row.leg}/hourly] ${row.tripDate} ${row.shiftTime} ` +
        `unbooked=${result.unbookedFound} sent=${result.remindersSent} ` +
        `alreadyReminded=${result.alreadyReminded} ` +
        `noDeviceToken=${result.missingDeviceToken} ` +
        `dispatchFailed=${result.dispatchFailed}`,
    );

    return result.remindersSent;
  }
}
