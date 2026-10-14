import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import * as moment from 'moment';

import { Team } from 'src/team/models/team.model';

import { ScheduleReminderSchedule } from '../models/schedule-reminder-schedule.model';
import { ScheduleReminderService } from './schedule-reminder.service';
import { ShiftTimeResolverService } from './shift-time-resolver.service';
import {
  CutoffLeg,
  resolveBookCutoffForReminder,
} from '../utils/cutoff-deadline.util';
import {
  ResolvedShiftTimes,
  resolveForTeam,
  timesForLeg,
} from '../utils/shift-time.util';
import {
  HourlyCutoff,
  HourlyCutoffError,
  SCHEDULE_HORIZON_DAYS,
  computeHourlyWindow,
  parseHourlyCutoff,
  parseReminderBuffer,
} from '../utils/hourly-cutoff.util';

const CONFIG_PICKUP_CUTOFF = 'PICKUP_SCHEDULE_CUTOFF';
const CONFIG_DROP_CUTOFF = 'DROP_SCHEDULE_CUTOFF';
/** Minutes before the hourly deadline that the nudge should land. */
const CONFIG_REMINDER_BUFFER = 'SCHEDULE_REMINDER_BUFFER';

export interface GenerateResult {
  orgID: string;
  rowsDeleted: number;
  rowsCreated: number;
  skipped: { scope: string; reason: string }[];
}

/**
 * Builds the upcoming hourly reminder instants for one org.
 *
 * Hourly cannot ride the 05:00 sweep: the window between `shift - upper` and
 * `shift - lower` can be an hour wide, and shift times are not on the hour
 * (09:30, 12:30 and 14:30 are all live), so a push has to be scheduled at a
 * precise instant rather than discovered by a periodic scan.
 *
 * Regeneration is delete-then-insert, scoped to one org. Rows already claimed
 * by the poller are status 'running' and are deliberately left alone — the
 * delete only removes 'pending' rows that have not fired yet.
 */
@Injectable()
export class ScheduleReminderGeneratorService {
  private readonly logger = new Logger(ScheduleReminderGeneratorService.name);

  constructor(
    @InjectModel(Team)
    private readonly teamModel: typeof Team,
    @InjectModel(ScheduleReminderSchedule)
    private readonly scheduleModel: typeof ScheduleReminderSchedule,
    private readonly reminderService: ScheduleReminderService,
    private readonly shiftTimes: ShiftTimeResolverService,
  ) {}

  async generateForOrg(
    orgID: bigint,
    now: moment.Moment = moment(),
  ): Promise<GenerateResult> {
    const result: GenerateResult = {
      orgID: String(orgID),
      rowsDeleted: 0,
      rowsCreated: 0,
      skipped: [],
    };

    const config = await this.reminderService.readOrgConfigValues(orgID, [
      CONFIG_PICKUP_CUTOFF,
      CONFIG_DROP_CUTOFF,
      CONFIG_REMINDER_BUFFER,
    ]);

    // Resolved once per org, not per row: the value is org-wide, so a bad one
    // would otherwise log identically for every leg, day and shift time.
    const buffer = parseReminderBuffer(config[CONFIG_REMINDER_BUFFER]);
    if (buffer.reason) {
      this.logger.warn(`org ${orgID}: ${buffer.reason}`);
    }

    const teams = await this.teamModel.findAll({
      where: { orgID },
      attributes: [
        'id',
        'name',
        'isTeamConfigEnabled',
        'teamConfig',
        'isShiftEnabled',
        'shiftLoginTime',
        'shiftLogoutTime',
      ],
    });

    const orgShiftTimes = await this.shiftTimes.resolveOrgShiftTimes(orgID);

    const rows: Partial<ScheduleReminderSchedule>[] = [];

    // Team cohorts: a team gets its own rows when it overrides the cutoff, the
    // shift times, or both. Everything else falls into the org cohort.
    //
    // teamOverrides() is the single source of that rule — the poller calls it
    // too, via resolveOverrideTeamIDs, so the org sweep excludes exactly the
    // teams that carry their own rows. If the two ever disagree, an employee
    // is either nudged twice or not at all.
    for (const team of teams) {
      if (!this.teamOverrides(team, config)) {
        continue;
      }

      // A team may override only the cutoff, in which case it still uses the
      // org's shift times.
      const shift = resolveForTeam(team as any) ?? orgShiftTimes;

      rows.push(
        ...this.buildRows({
          orgID,
          teamID: team.id,
          scope: `team:${team.id}`,
          team,
          config,
          shift,
          now,
          bufferMinutes: buffer.minutes,
          skipped: result.skipped,
        }),
      );
    }

    rows.push(
      ...this.buildRows({
        orgID,
        teamID: null,
        scope: `org:${orgID}`,
        team: null,
        config,
        shift: orgShiftTimes,
        now,
        bufferMinutes: buffer.minutes,
        skipped: result.skipped,
      }),
    );

    // Delete first, then insert. Anything the poller already claimed is
    // 'running', and anything it finished is 'done' or 'skipped' — all survive,
    // so a regeneration mid-send cannot cancel a push that is already going out
    // and cannot resurrect one that already went.
    //
    // ALL pending rows go, not just future ones. Scoping this to
    // `runAt >= now` kept pending rows whose runAt had already passed, and the
    // freshly computed replacement for the same
    // (orgID, teamID, leg, shiftTime, tripDate) unique key was then silently
    // dropped by bulkCreate's ignoreDuplicates — so a config change did not
    // apply to exactly the rows most likely to be about to fire, with no error
    // and an under-reported rowsCreated.
    result.rowsDeleted = await this.scheduleModel.destroy({
      where: {
        orgID,
        status: 'pending',
      },
    });

    if (rows.length > 0) {
      // ignoreDuplicates rather than updateOnDuplicate: the unique constraint
      // is split across two partial indexes (teamID NULL / NOT NULL), which
      // ON CONFLICT cannot target without naming one of them.
      const created = await this.scheduleModel.bulkCreate(rows as any[], {
        ignoreDuplicates: true,
      });
      result.rowsCreated = created.length;
    }

    return result;
  }

  private buildRows(input: {
    orgID: bigint;
    teamID: bigint | null;
    scope: string;
    team: Team | null;
    config: Record<string, string>;
    shift: ResolvedShiftTimes;
    now: moment.Moment;
    bufferMinutes: number;
    skipped: { scope: string; reason: string }[];
  }): Partial<ScheduleReminderSchedule>[] {
    const {
      orgID,
      teamID,
      scope,
      team,
      config,
      shift,
      now,
      bufferMinutes,
      skipped,
    } = input;
    const rows: Partial<ScheduleReminderSchedule>[] = [];

    for (const leg of ['pick', 'drop'] as CutoffLeg[]) {
      const orgValue =
        leg === 'pick'
          ? config[CONFIG_PICKUP_CUTOFF]
          : config[CONFIG_DROP_CUTOFF];

      const resolved = resolveBookCutoffForReminder(team, orgValue, leg);
      if (!resolved.ok) {
        continue;
      }

      const cutoffResult = parseHourlyCutoff(resolved.configValue);
      if (cutoffResult.ok !== true) {
        // Not hourly, or hourly with no usable deadline. Non-hourly modes are
        // handled by the existing 05:00 sweep, so this is not an error — but
        // it is recorded, because an org silently absent from reminders is
        // exactly the failure mode this feature keeps hitting.
        const failure = cutoffResult as HourlyCutoffError;
        skipped.push({ scope: `${scope}/${leg}`, reason: failure.reason });
        continue;
      }
      const cutoff: HourlyCutoff = cutoffResult;

      const times = timesForLeg(shift, leg);
      if (times.length === 0) {
        skipped.push({
          scope: `${scope}/${leg}`,
          reason: shift.reason ?? 'no shift times for this leg',
        });
        continue;
      }

      for (let dayOffset = 0; dayOffset <= SCHEDULE_HORIZON_DAYS; dayOffset++) {
        const tripDate = now
          .clone()
          .add(dayOffset, 'days')
          .format('YYYY-MM-DD');

        for (const shiftTime of times) {
          const window = computeHourlyWindow(
            tripDate,
            shiftTime,
            cutoff,
            bufferMinutes,
          );
          if (!window) {
            continue;
          }

          // Deadline already gone: nothing to remind about.
          if (!window.closesAt.isAfter(now)) {
            continue;
          }

          // Buffer moment already passed but the deadline has NOT: fire on the
          // next poll rather than dropping the row. The employee can still act,
          // so this is a late nudge, not a wasted one.
          const runAt = window.runAt.isAfter(now) ? window.runAt : now.clone();

          rows.push({
            orgID,
            teamID,
            leg,
            shiftTime,
            tripDate,
            runAt: runAt.toDate(),
            status: 'pending',
          });
        }
      }
    }

    return rows;
  }

  /**
   * Teams in this org that carry their own schedule rows.
   *
   * Resolved at fire time rather than stored on the row: the schedule is built
   * up to 7 days ahead, and a team gaining or losing its own shift times or
   * cutoff inside that window would make a stored list wrong — producing either
   * a duplicate push or none at all.
   *
   * The rule must stay identical to generateForOrg's, or the org cohort and the
   * team cohorts will disagree about who owns an employee.
   */
  async resolveOverrideTeamIDs(orgID: bigint): Promise<bigint[]> {
    const config = await this.reminderService.readOrgConfigValues(orgID, [
      CONFIG_PICKUP_CUTOFF,
      CONFIG_DROP_CUTOFF,
    ]);

    const teams = await this.teamModel.findAll({
      where: { orgID },
      attributes: [
        'id',
        'isTeamConfigEnabled',
        'teamConfig',
        'isShiftEnabled',
        'shiftLoginTime',
        'shiftLogoutTime',
      ],
    });

    return teams
      .filter((team) => this.teamOverrides(team, config))
      .map((team) => team.id);
  }

  private teamOverrides(team: Team, config: Record<string, string>): boolean {
    if (resolveForTeam(team as any)) {
      return true;
    }

    return (['pick', 'drop'] as CutoffLeg[]).some((leg) => {
      const orgValue =
        leg === 'pick'
          ? config[CONFIG_PICKUP_CUTOFF]
          : config[CONFIG_DROP_CUTOFF];
      const resolved = resolveBookCutoffForReminder(team, orgValue, leg);
      return resolved.ok ? resolved.source === 'team' : true;
    });
  }

  /** Prune rows whose moment has passed. Called by the nightly rebuild. */
  async prune(before: moment.Moment = moment().subtract(2, 'days')) {
    return this.scheduleModel.destroy({
      where: { runAt: { [Op.lt]: before.toDate() } },
    });
  }
}
