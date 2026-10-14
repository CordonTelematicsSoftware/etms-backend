import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
import * as moment from 'moment';

import { Employee } from 'src/employee/models/employee.model';
import { EmployeeDeviceInfo } from 'src/auth/models/employee-device-model';
import { Organization } from 'src/organization/models/organization.model';
import { Team } from 'src/team/models/team.model';
import { ConfigurationMaster } from 'src/config-management/config/models/config.model';
import { CompanyConfiguration } from 'src/config-management/company-config/models/company-config.model';
import { EmployeeType, Status } from 'src/shared/enums';
import { NotificationChannel } from 'src/notifications/enums/notification-channel.enum';
import { NotificationEvents } from 'src/notifications/enums/notification-events.enum';
import { NotificationDispatcherService } from 'src/notifications/services/notification-dispatcher.service';

import { ScheduleReminderLog } from '../models/schedule-reminder-log.model';
import {
  parseReminderLead,
  reminderLeadToMinutes,
} from '../utils/reminder-lead.util';
import {
  CutoffDeadline,
  CutoffLeg,
  computeNextCutoffDeadline,
  isCutoffInPlay,
  resolveBookCutoffForReminder,
} from '../utils/cutoff-deadline.util';

/** Config keys read per org. */
const CONFIG_PICKUP_CUTOFF = 'PICKUP_SCHEDULE_CUTOFF';
const CONFIG_DROP_CUTOFF = 'DROP_SCHEDULE_CUTOFF';
const CONFIG_REMINDER_LEAD = 'SCHEDULE_REMINDER_LEAD';

/**
 * What counts as "already booked".
 *
 * Includes Status.Active deliberately. Active is the TripRequest model default
 * (trip-request.model.ts:87) and is what create() writes whenever auto-approval
 * is off (trip-request.service.ts:496, :538), so excluding it would nag
 * employees who have in fact booked.
 *
 * NOTE this is intentionally WIDER than getShiftTimesData, which counts only
 * [Approved, Requested] (trip-request.service.ts:5001). The admin grid and this
 * reminder will therefore disagree for rows in Active. That divergence is
 * deliberate and was signed off; fixing the grid is a separate task.
 */
const BOOKED_STATUSES: string[] = [
  Status.Approved,
  Status.Requested,
  Status.Active,
];

/** Employees selected per round-trip. */
const CHUNK_SIZE = 500;

export interface SweepOptions {
  /** Overrides "now". Test/dry-run hook only. */
  now?: moment.Moment;
  /** Restrict the sweep to specific orgs. Omit for all active orgs. */
  orgIDs?: (string | number | bigint)[];
  /**
   * Resolve and select everything, but send nothing and write no ledger rows.
   * Used to verify targeting before the cron is wired live.
   */
  dryRun?: boolean;
}

export interface SweepCohortResult {
  orgID: string;
  cohortKey: string;
  leg: CutoffLeg;
  mode: string;
  cutoffAt: string;
  periodKey: string;
  unbookedFound: number;
  remindersSent: number;
  alreadyReminded: number;
  missingDeviceToken: number;
  /**
   * Selected and claimed, but nothing was delivered, so the ledger slot was
   * released and the employee stays eligible. Kept apart from alreadyReminded:
   * these are MISSES, and folding them into a "already had one" counter is how
   * an org silently receiving zero reminders looks healthy in the logs.
   */
  dispatchFailed: number;
}

/**
 * Outcome of one reminder attempt.
 *
 *  sent           - a channel accepted it; the ledger slot stays claimed.
 *  duplicate      - another run claimed the slot first. Not a miss.
 *  not-dispatched - nothing was delivered; the slot was released again, so a
 *                   later instant for the same period can retry this employee.
 */
type SendReminderOutcome = 'sent' | 'duplicate' | 'not-dispatched';

export interface SweepSummary {
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  orgsConsidered: number;
  orgsSkipped: { orgID: string; reason: string }[];
  cohorts: SweepCohortResult[];
  totalRemindersSent: number;
  errors: string[];
}

/**
 * Schedule-cutoff reminder.
 *
 * Nudges active employees who have not booked for the period their booking
 * cutoff is about to close, a configurable lead time before that cutoff.
 *
 * Self-contained by design: this service does not call into TripRequestService
 * or ConfigService. The cutoff resolution and deadline maths are replicated
 * read-only in ../utils/cutoff-deadline.util.ts (see that file's header for the
 * source line references and the deliberate divergences), and the org config
 * read is replicated privately below. Nothing here writes to TripRequests.
 */
@Injectable()
export class ScheduleReminderService {
  private readonly logger = new Logger(ScheduleReminderService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(EmployeeDeviceInfo)
    private readonly employeeDeviceInfoModel: typeof EmployeeDeviceInfo,
    @InjectModel(Organization)
    private readonly organizationModel: typeof Organization,
    @InjectModel(Team)
    private readonly teamModel: typeof Team,
    @InjectModel(ConfigurationMaster)
    private readonly configurationMasterModel: typeof ConfigurationMaster,
    @InjectModel(CompanyConfiguration)
    private readonly companyConfigurationModel: typeof CompanyConfiguration,
    @InjectModel(ScheduleReminderLog)
    private readonly reminderLogModel: typeof ScheduleReminderLog,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  // ---------------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------------

  async runSweep(options: SweepOptions = {}): Promise<SweepSummary> {
    const now = options.now ? options.now.clone() : moment();
    const dryRun = options.dryRun === true;

    const summary: SweepSummary = {
      dryRun,
      startedAt: now.toISOString(),
      finishedAt: null,
      orgsConsidered: 0,
      orgsSkipped: [],
      cohorts: [],
      totalRemindersSent: 0,
      errors: [],
    };

    const orgs = await this.loadOrganizations(options.orgIDs);
    summary.orgsConsidered = orgs.length;

    for (const org of orgs) {
      try {
        await this.sweepOrganization(org, now, dryRun, summary);
      } catch (error) {
        // One org's bad data must never abort the run for the others.
        const message = `org ${org.id}: ${error?.message ?? error}`;
        summary.errors.push(message);
        this.logger.error(message, error?.stack);
      }
    }

    summary.finishedAt = moment().toISOString();
    return summary;
  }

  // ---------------------------------------------------------------------------
  // Per-org sweep
  // ---------------------------------------------------------------------------

  private async sweepOrganization(
    org: Organization,
    now: moment.Moment,
    dryRun: boolean,
    summary: SweepSummary,
  ): Promise<void> {
    const orgID = String(org.id);

    const config = await this.readOrgConfigValues(org.id, [
      CONFIG_PICKUP_CUTOFF,
      CONFIG_DROP_CUTOFF,
      CONFIG_REMINDER_LEAD,
    ]);

    const lead = parseReminderLead(config[CONFIG_REMINDER_LEAD]);
    if (!lead.enabled) {
      // Daily ignores lead by design — only weekly/monthly need it enabled.
      summary.orgsSkipped.push({
        orgID,
        reason: `reminder lead disabled (${lead.reason}); weekly/monthly skipped, daily unaffected`,
      });
    }

    const windowEnd: moment.Moment | null = lead.enabled
      ? now.clone().add(reminderLeadToMinutes(lead), 'minutes')
      : null;

    const cohorts = await this.buildCohorts(
      org.id,
      config[CONFIG_PICKUP_CUTOFF],
      config[CONFIG_DROP_CUTOFF],
    );

    for (const cohort of cohorts) {
      // periodKey excludes the leg on purpose (see cutoff-deadline.util), so if
      // pick and drop gate the same period the employee is nudged once.
      const inPlay = new Map<
        string,
        { deadline: CutoffDeadline; leg: CutoffLeg }
      >();

      for (const leg of ['pick', 'drop'] as CutoffLeg[]) {
        const resolved = cohort.config[leg];
        if (resolved.ok !== true) {
          // Recorded, not swallowed. An org whose cutoff cannot be resolved
          // sends nothing, and without this line that is indistinguishable in
          // the log from an org where everyone had already booked.
          //
          // Cast because strictNullChecks is off, which disables narrowing on a
          // boolean discriminant — same reason and same shape as the generator
          // does it (schedule-reminder-generator.service.ts:187-197).
          summary.orgsSkipped.push({
            orgID,
            reason: `${cohort.key}/${leg}: ${
              (resolved as { ok: false; reason: string }).reason
            }`,
          });
          continue;
        }

        const computed = computeNextCutoffDeadline(resolved.configValue, now);
        if (computed.ok !== true) {
          // Same reasoning. Live example: 'Daily,0,19:00' lowercases to a
          // recognised mode but '0' is neither sameday nor previousday, so the
          // whole org silently received nothing. The config value is echoed
          // because the reason alone does not identify which value was bad.
          summary.orgsSkipped.push({
            orgID,
            reason: `${cohort.key}/${leg}: ${
              (computed as { ok: false; reason: string }).reason
            } (config "${resolved.configValue}")`,
          });
          continue;
        }

        const deadline = computed.deadline;

        // NOT recorded, deliberately: a valid cutoff outside the lead window is
        // the normal state for most of a weekly/monthly period, so logging it
        // would emit a line per org per leg per run for healthy orgs and bury
        // the two skips above. Do not "fix" this by adding a push here.
        if (!isCutoffInPlay(deadline, now, windowEnd)) {
          continue;
        }

        if (!inPlay.has(deadline.periodKey)) {
          inPlay.set(deadline.periodKey, { deadline, leg });
        }
      }

      for (const { deadline, leg } of inPlay.values()) {
        const result = await this.remindCohortForPeriod(
          org,
          cohort,
          deadline,
          leg,
          dryRun,
        );
        summary.cohorts.push(result);
        summary.totalRemindersSent += result.remindersSent;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cohorts
  // ---------------------------------------------------------------------------

  /**
   * A cohort is a set of employees sharing one resolved cutoff configuration.
   *
   * Teams whose config overrides the org each become their own cohort. Everyone
   * else — no team, a team with config disabled, a team with no BOOK block, or a
   * team row that no longer exists — falls into the org cohort, expressed as
   * "teamID IS NULL OR teamID NOT IN (<override team ids>)" so a dangling
   * teamID cannot drop an employee out of the sweep entirely.
   */
  private async buildCohorts(
    orgID: bigint,
    orgPickConfig: string,
    orgDropConfig: string,
  ): Promise<ReminderCohort[]> {
    const teams = await this.teamModel.findAll({
      where: { orgID, isTeamConfigEnabled: true },
      attributes: ['id', 'name', 'isTeamConfigEnabled', 'teamConfig'],
    });

    const cohorts: ReminderCohort[] = [];
    const overrideTeamIDs: bigint[] = [];

    for (const team of teams) {
      const pick = resolveBookCutoffForReminder(team, orgPickConfig, 'pick');
      const drop = resolveBookCutoffForReminder(team, orgDropConfig, 'drop');

      const overridesPick = pick.ok ? pick.source === 'team' : true;
      const overridesDrop = drop.ok ? drop.source === 'team' : true;

      if (!overridesPick && !overridesDrop) {
        // Config enabled but resolves identically to the org — leave in the org
        // cohort rather than issuing a separate query for it.
        continue;
      }

      overrideTeamIDs.push(team.id);
      cohorts.push({
        key: `team:${team.id}`,
        label: `team ${team.name ?? team.id}`,
        teamPredicate: { teamID: team.id },
        config: { pick, drop },
      });
    }

    const orgTeamPredicate =
      overrideTeamIDs.length > 0
        ? {
            [Op.or]: [
              { teamID: { [Op.is]: null } },
              { teamID: { [Op.notIn]: overrideTeamIDs } },
            ],
          }
        : {};

    cohorts.push({
      key: 'org',
      label: 'org default',
      teamPredicate: orgTeamPredicate,
      config: {
        pick: resolveBookCutoffForReminder(null, orgPickConfig, 'pick'),
        drop: resolveBookCutoffForReminder(null, orgDropConfig, 'drop'),
      },
    });

    return cohorts;
  }

  // ---------------------------------------------------------------------------
  // The sweep itself
  // ---------------------------------------------------------------------------

  private async remindCohortForPeriod(
    org: Organization,
    cohort: ReminderCohort,
    deadline: CutoffDeadline,
    leg: CutoffLeg,
    dryRun: boolean,
  ): Promise<SweepCohortResult> {
    const result: SweepCohortResult = {
      orgID: String(org.id),
      cohortKey: cohort.key,
      leg,
      mode: deadline.mode,
      cutoffAt: moment(deadline.cutoffAt).toISOString(),
      periodKey: deadline.periodKey,
      unbookedFound: 0,
      remindersSent: 0,
      alreadyReminded: 0,
      missingDeviceToken: 0,
      dispatchFailed: 0,
    };

    let offset = 0;

    for (;;) {
      const employees = await this.findUnbookedEmployees(
        org.id,
        cohort,
        deadline,
        offset,
      );

      if (employees.length === 0) {
        break;
      }

      result.unbookedFound += employees.length;

      const employeeIDs = employees.map((employee) => employee.id);
      const alreadyReminded = await this.findAlreadyReminded(
        employeeIDs,
        deadline.periodKey,
      );
      const deviceTokens = await this.findLatestDeviceTokens(employeeIDs);

      for (const employee of employees) {
        const employeeID = String(employee.id);

        if (alreadyReminded.has(employeeID)) {
          result.alreadyReminded += 1;
          continue;
        }

        const deviceToken = deviceTokens.get(employeeID);
        if (!deviceToken) {
          // No registered device: a push has nowhere to go. Deliberately NOT
          // falling back to SMS — this feature is push-only by scope.
          result.missingDeviceToken += 1;
          continue;
        }

        if (dryRun) {
          result.remindersSent += 1;
          continue;
        }

        try {
          const outcome = await this.sendReminder(
            org,
            employee,
            deviceToken,
            deadline,
            leg,
          );
          if (outcome === 'sent') {
            result.remindersSent += 1;
          } else if (outcome === 'duplicate') {
            result.alreadyReminded += 1;
          } else {
            result.dispatchFailed += 1;
          }
        } catch (error) {
          // Contain the blast radius at the employee: one undeliverable
          // recipient must not abandon the rest of the cohort, nor the org's
          // remaining cohorts. sendReminder has already released the ledger
          // slot, so this employee is still eligible on a later instant.
          result.dispatchFailed += 1;
          this.logger.error(
            `reminder failed for employee ${employeeID} (period ${
              deadline.periodKey
            }): ${error?.message ?? error}`,
            error?.stack,
          );
        }
      }

      if (employees.length < CHUNK_SIZE) {
        break;
      }

      // Paginate by offset. Safe here because nothing in this loop mutates the
      // predicate: ledger rows are not part of the employee query, and the
      // sweep does not write TripRequests.
      offset += CHUNK_SIZE;
    }

    return result;
  }

  /**
   * Active employees in this cohort with NO TripRequest covering the period.
   *
   * The NOT EXISTS is correlated on employeeID with a half-open range on date,
   * which is exactly the shape of trip_requests_employee_date_active
   * (migration 50260817000000). Half-open rather than BETWEEN because
   * TripRequests.date is timestamptz: a BETWEEN with a date string would make
   * the upper bound midnight and silently drop the last day's rows.
   */
  private async findUnbookedEmployees(
    orgID: bigint,
    cohort: ReminderCohort,
    deadline: CutoffDeadline,
    offset: number,
  ): Promise<Employee[]> {
    // Formatted as a NAIVE local wall-clock string on purpose — do not "fix"
    // this to an ISO/UTC timestamp.
    //
    // TripRequests.date is timestamptz, but every writer stores a naive
    // 'YYYY-MM-DD' string (e.g. trip-request.service.ts:496, :502-534), which
    // Postgres resolves in the session timezone. The Sequelize connection sets
    // no `timezone` option (app.module.ts:76-103), so that session zone is UTC
    // and a booking for the 18th lands at 2026-08-18T00:00:00Z.
    //
    // Sending the same naive wall-clock form here makes the comparison agree
    // with how the rows were written, on any server timezone. Converting to UTC
    // first would shift the boundary by the server's offset and silently select
    // the wrong day.
    const periodStart = this.sequelize.escape(
      moment(deadline.periodStart).format('YYYY-MM-DD'),
    );
    const periodEnd = this.sequelize.escape(
      moment(deadline.periodEnd).format('YYYY-MM-DD'),
    );
    const statusList = BOOKED_STATUSES.map((status) =>
      this.sequelize.escape(status),
    ).join(', ');

    return this.employeeModel.findAll({
      where: {
        orgID,
        employeeType: EmployeeType.Employee,
        status: Status.Active,
        [Op.and]: [
          cohort.teamPredicate,
          // exit is declared `exit: Status` but defaulted to boolean false
          // (employee.model.ts:172) and read as a boolean everywhere. IS NOT
          // TRUE covers false and NULL; Op.not would not be NULL-safe.
          this.sequelize.literal(
            `("Employee"."exit" IS NULL OR "Employee"."exit" <> 'true')`,
          ),
          this.sequelize.literal(`NOT EXISTS (
            SELECT 1
              FROM "TripRequests" AS tr
             WHERE tr."employeeID" = "Employee"."id"
               AND tr."deletedAt" IS NULL
               AND tr."status" IN (${statusList})
               AND tr."date" >= ${periodStart}
               AND tr."date" <  ${periodEnd}
          )`),
        ],
      },
      attributes: ['id', 'name', 'employeeCode', 'email', 'phone', 'teamID'],
      order: [['id', 'ASC']],
      limit: CHUNK_SIZE,
      offset,
    });
  }

  /** Employee ids already reminded for this period. */
  private async findAlreadyReminded(
    employeeIDs: bigint[],
    cutoffPeriodKey: string,
  ): Promise<Set<string>> {
    if (employeeIDs.length === 0) {
      return new Set();
    }

    const rows = await this.reminderLogModel.findAll({
      where: { employeeID: { [Op.in]: employeeIDs }, cutoffPeriodKey },
      attributes: ['employeeID'],
    });

    return new Set(rows.map((row) => String(row.employeeID)));
  }

  /**
   * Newest device token per employee. Mirrors the selection at
   * driver.trip.services.ts:519-522 (most recent by createdAt).
   */
  private async findLatestDeviceTokens(
    employeeIDs: bigint[],
  ): Promise<Map<string, string>> {
    const tokens = new Map<string, string>();
    if (employeeIDs.length === 0) {
      return tokens;
    }

    const rows = await this.employeeDeviceInfoModel.findAll({
      where: {
        employeeID: { [Op.in]: employeeIDs },
        deviceToken: { [Op.ne]: null },
      },
      attributes: ['employeeID', 'deviceToken', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    for (const row of rows) {
      const key = String(row.employeeID);
      // Rows arrive newest-first, so the first one wins.
      if (!tokens.has(key) && row.deviceToken) {
        tokens.set(key, row.deviceToken);
      }
    }

    return tokens;
  }

  /**
   * Claim the (employee, period) slot, then dispatch.
   *
   * The ledger row is inserted BEFORE the notify call, not after. The unique
   * constraint on (employeeID, cutoffPeriodKey) is the only defence against a
   * double-fire — there is no distributed lock in this codebase, and lambda.ts
   * shares AppModule with the cron. Inserting after the send would let two
   * concurrent runs both read "not reminded", both send, and only then collide
   * on the insert: a duplicate push, which is exactly what the constraint
   * exists to prevent. Claiming first makes the constraint load-bearing.
   *
   * The claim is RELEASED again when the dispatch delivered nothing, so
   * at-most-once now applies only to genuine deliveries. Three cases release:
   *
   *   - notify() returned no log ids at all. It does that quietly when the org
   *     has no enabled OrganizationNotificationSetting for PUSH, or no enabled
   *     OrganizationNotificationEventConfig for schedule.booking.reminder.
   *     Nothing seeds that event config, so it is the day-one default for every
   *     org: without the release, a whole org is marked reminded having been
   *     sent nothing, and the unique constraint makes that permanent.
   *   - every log id came back in failedLogIds.
   *   - notify() threw.
   *
   * Do NOT go back to writing sentAt unconditionally. `WHERE "sentAt" IS NULL`
   * no longer finds these misses, because the row is gone — which is the point:
   * a released slot is retried by the next instant for the same period. What
   * that query still finds is a row claimed by a process that died mid-dispatch
   * and never reached either branch below.
   */
  private async sendReminder(
    org: Organization,
    employee: Employee,
    deviceToken: string,
    deadline: CutoffDeadline,
    leg: CutoffLeg,
  ): Promise<SendReminderOutcome> {
    let ledgerRow: ScheduleReminderLog;

    try {
      ledgerRow = await this.reminderLogModel.create({
        employeeID: employee.id,
        orgID: org.id,
        cutoffPeriodKey: deadline.periodKey,
        mode: deadline.mode,
        leg,
        cutoffAt: deadline.cutoffAt,
      } as any);
    } catch (error) {
      if (error?.name === 'SequelizeUniqueConstraintError') {
        // Another run claimed it first. Not an error, and NOT a miss — the
        // winner is dispatching. Returns before any dispatch of our own.
        return 'duplicate';
      }
      throw error;
    }

    const result = await this.notificationDispatcher
      .notify({
        organizationId: String(org.id),
        event: NotificationEvents.SCHEDULE_BOOKING_REMINDER,
        locale: 'en',
        // Direct-send, matching every other notify() call site in the codebase.
        // The SQS path is unused elsewhere: a failed enqueue marks the log FAILED
        // with no fallback, while the reminder ledger has already claimed the
        // period — so a queue outage silently drops that day's reminders.
        queue: false,
        recipient: {
          id: String(employee.id),
          firstName: employee.name,
          email: employee.email,
          phoneNumber: employee.phone,
          deviceToken,
        },
        channels: [NotificationChannel.PUSH],
        data: {
          name: employee.name,
          employeeCode: employee.employeeCode,
          organizationName: org.name,
          mode: deadline.mode,
          leg,
          cutoffAt: moment(deadline.cutoffAt).format('DD/MM/YYYY hh:mm A'),
          periodStart: moment(deadline.periodStart).format('DD/MM/YYYY'),
          // periodEnd is exclusive; show the last included day.
          periodEnd: moment(deadline.periodEnd)
            .subtract(1, 'day')
            .format('DD/MM/YYYY'),
        },
        empID: String(employee.id),
      })
      // The slot is claimed before the dispatch, and the caller swallows a
      // throw per-employee, so without this release nothing would ever retry
      // this employee for this period.
      .catch(async (error) => {
        await this.releaseClaim(ledgerRow);
        throw error;
      });

    const logIds = result?.logIds ?? [];
    const deliveredLogIds = result?.deliveredLogIds ?? [];
    const failedLogIds = result?.failedLogIds ?? [];

    if (logIds.length === 0) {
      // notify() returns { logIds: [] } and no error here — see the header.
      await this.releaseClaim(ledgerRow);
      this.logger.warn(
        `reminder NOT dispatched for employee ${employee.id} (org ${org.id}, ` +
          `period ${deadline.periodKey}): no enabled push notification config — ` +
          `org needs an enabled OrganizationNotificationSetting for PUSH and an ` +
          `enabled OrganizationNotificationEventConfig for ` +
          `${NotificationEvents.SCHEDULE_BOOKING_REMINDER}. Ledger slot released.`,
      );
      return 'not-dispatched';
    }

    if (deliveredLogIds.length === 0) {
      // Every channel failed. deliverLog has already written errorCode and
      // errorMessage onto each NotificationLogs row; this module does not
      // register that model, so the ids are logged instead of the codes.
      await this.releaseClaim(ledgerRow);
      this.logger.warn(
        `reminder NOT delivered for employee ${employee.id} (org ${org.id}, ` +
          `period ${deadline.periodKey}): all channels failed — ` +
          `NotificationLogs ids [${
            failedLogIds.join(', ') || logIds.join(', ')
          }]. ` +
          `Ledger slot released.`,
      );
      return 'not-dispatched';
    }

    await ledgerRow.update({
      sentAt: new Date(),
      notificationLogId: result?.logIds?.[0] ?? null,
    });

    return 'sent';
  }

  /**
   * Give a claimed ledger slot back so the employee stays eligible.
   *
   * Errors are logged, never thrown: this runs on the failure path, and a
   * failed release must not replace the real error the caller is handling.
   * The model is paranoid:false, so this is a hard DELETE and the unique slot
   * is genuinely freed.
   */
  private async releaseClaim(ledgerRow: ScheduleReminderLog): Promise<void> {
    try {
      await ledgerRow.destroy();
    } catch (error: any) {
      this.logger.error(
        `failed to release reminder ledger row ${ledgerRow?.id}: ${
          error?.message ?? error
        } — that employee/period slot stays burned.`,
        error?.stack,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Config + org reads (replicated, read-only)
  // ---------------------------------------------------------------------------

  private async loadOrganizations(
    orgIDs?: (string | number | bigint)[],
  ): Promise<Organization[]> {
    const where: any = { status: Status.Active };
    if (orgIDs?.length) {
      where.id = { [Op.in]: orgIDs };
    }

    return this.organizationModel.findAll({
      where,
      attributes: ['id', 'name'],
      order: [['id', 'ASC']],
    });
  }

  /**
   * Per-org config values, replicating the resolution in
   * config.service.ts:77-121 without depending on that service:
   *   CompanyConfiguration.configValue for the org, else
   *   ConfigurationMaster.defaultValue.
   *
   * Config names are matched fuzzily the same way the live reader does —
   * REPLACE(LOWER(configName), '_', ' ') on both sides — so a master row stored
   * as "Pickup schedule cutoff" matches the key PICKUP_SCHEDULE_CUTOFF.
   *
   * Note this reads defaultValue, NOT ConfigurationMaster.configValue, matching
   * live behaviour exactly (config.service.ts:113).
   */
  async readOrgConfigValues(
    orgID: bigint,
    configNames: string[],
  ): Promise<Record<string, string>> {
    const normalized = configNames.map((name) =>
      name.toLowerCase().replace(/_+/g, ' '),
    );

    // One equality clause per name, OR'd. This mirrors the exact construct the
    // live reader uses (config.service.ts / trip-cron.service.ts:265-272)
    // rather than passing an Op.in to sequelize.where(), which is a shape the
    // codebase has no precedent for.
    const masters = await this.configurationMasterModel.findAll({
      where: {
        [Op.or]: normalized.map((name) =>
          this.sequelize.where(
            this.sequelize.fn(
              'REPLACE',
              this.sequelize.fn('LOWER', this.sequelize.col('configName')),
              '_',
              ' ',
            ),
            name,
          ),
        ),
      },
      attributes: ['id', 'configName', 'defaultValue'],
    });

    const values: Record<string, string> = {};
    if (masters.length === 0) {
      return values;
    }

    const companyConfigs = await this.companyConfigurationModel.findAll({
      where: {
        orgID,
        configID: { [Op.in]: masters.map((master) => master.id) },
      },
      attributes: ['configID', 'configValue'],
    });

    const overrides = new Map(
      companyConfigs.map((config) => [
        String(config.configID),
        config.configValue,
      ]),
    );

    for (const master of masters) {
      const normalizedName = master.configName
        .toLowerCase()
        .replace(/_+/g, ' ');
      const index = normalized.indexOf(normalizedName);
      if (index === -1) {
        continue;
      }
      values[configNames[index]] =
        overrides.get(String(master.id)) ?? master.defaultValue;
    }

    return values;
  }

  /**
   * Remind one scheduled hourly instant: a single (org|team, leg, shift time,
   * trip date) target claimed by the poller.
   *
   * The period key includes the leg and the shift time, unlike
   * daily/weekly/monthly which key on the booking period alone. Product
   * decision: each shift time is a separate bookable slot with its own
   * deadline, so an employee who has booked nothing is nudged once per slot —
   * login times drive pick, logout times drive drop. A real org runs ~4 of
   * each, so ~8 pushes spread across the day, each landing
   * SCHEDULE_REMINDER_HOURLY_BUFFER minutes before its own deadline.
   *
   * Suppression is unaffected by this key. findUnbookedEmployees is
   * day-granular — it correlates on employeeID over a [tripDate, tripDate+1)
   * range and never sees the leg or the shift time — so one booking anywhere in
   * the day removes the employee from every later instant's audience. Booking
   * stops the nudges, not the ledger key.
   *
   * SIZING CAVEAT: this scales with the number of configured shift times. An
   * org with 13 login and 13 logout times would mean 26 pushes a day to an
   * employee who books nothing. Cap the shift-time lists, not the key.
   *
   * The schedule rows stay per (leg, shiftTime). leg and shiftTime are carried
   * on the row for the cutoff computation and for the poller's log line.
   */
  async remindHourlyTarget(input: {
    orgID: bigint;
    teamID: bigint | null;
    leg: CutoffLeg;
    shiftTime: string;
    tripDate: string;
    cutoffAt: Date;
    excludeTeamIDs?: bigint[];
    dryRun?: boolean;
  }): Promise<SweepCohortResult | null> {
    const org = await this.organizationModel.findOne({
      where: { id: input.orgID, status: Status.Active },
    });

    if (!org) {
      return null;
    }

    const periodStart = moment(input.tripDate, 'YYYY-MM-DD', true)
      .startOf('day')
      .toDate();
    const periodEnd = moment(input.tripDate, 'YYYY-MM-DD', true)
      .startOf('day')
      .add(1, 'day')
      .toDate();

    const deadline: CutoffDeadline = {
      mode: 'hourly',
      cutoffAt: input.cutoffAt,
      // Per (trip date, leg, shift time): each shift time is its own bookable
      // slot with its own deadline — see the method header. Suppression stays
      // day-granular via findUnbookedEmployees.
      periodKey: `hourly:${input.tripDate}:${input.leg}:${input.shiftTime}`,
      periodStart,
      periodEnd,
    };

    const teamPredicate = input.teamID
      ? { teamID: input.teamID }
      : (input.excludeTeamIDs ?? []).length > 0
      ? {
          [Op.or]: [
            { teamID: { [Op.is]: null } },
            { teamID: { [Op.notIn]: input.excludeTeamIDs } },
          ],
        }
      : {};

    const cohort = {
      key: input.teamID ? `team:${input.teamID}` : `org:${input.orgID}`,
      label: input.teamID ? `team ${input.teamID}` : 'org default',
      teamPredicate,
      // Unused by remindCohortForPeriod — the deadline is already resolved.
      config: {} as any,
    } as any;

    return this.remindCohortForPeriod(
      org,
      cohort,
      deadline,
      input.leg,
      input.dryRun === true,
    );
  }
}

interface ReminderCohort {
  key: string;
  label: string;
  /** Sequelize where-fragment selecting this cohort's employees. */
  teamPredicate: any;
  config: {
    pick: ReturnType<typeof resolveBookCutoffForReminder>;
    drop: ReturnType<typeof resolveBookCutoffForReminder>;
  };
}
