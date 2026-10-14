import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ScheduleReminderService } from './schedule-reminder.service';

/** Set to the literal string 'true' to arm the cron. Anything else keeps it inert. */
export const SCHEDULE_REMINDER_CRON_FLAG = 'SCHEDULE_REMINDER_CRON_ENABLED';

/**
 * 06:00 daily, server local time.
 *
 * There is no per-org timezone anywhere in this codebase (Organization has no
 * such column), and the cutoff maths this reminder mirrors is likewise all bare
 * moment(). So "early morning" is uniformly server-local, consistent with the
 * deadlines being reminded about.
 */
const CRON_EXPRESSION = '0 5 * * *';

/**
 * Daily trigger for the schedule-cutoff reminder sweep.
 *
 * ENV GATING — why the body is guarded rather than the provider registered
 * conditionally:
 *
 * The obvious alternative is to omit the provider entirely unless the flag is
 * set, so @nestjs/schedule never discovers the @Cron and no timer is created at
 * all. That is cleaner in principle, and it is NOT usable here.
 *
 * This app has no top-level dotenv import; env comes from
 * ConfigModule.forRoot({ envFilePath: ['.env'] }) in app.module.ts:69-72.
 * forRoot() is a static call evaluated in the @Module decorator body of
 * app.module.ts, which runs AFTER its import statements — and this module is one
 * of those imports. So any process.env read at module-definition time in this
 * file executes BEFORE the .env file has been loaded, and would see undefined
 * for a flag the operator had correctly set in .env.
 *
 * That failure is silent and inverted: the cron would stay off while the config
 * says it is on. A runtime read inside the handler runs long after bootstrap and
 * always observes the real value, whether it came from .env or the process
 * environment.
 *
 * The cost is a timer that exists and fires once a day to immediately return —
 * no DB access, no dispatch, no allocation beyond a log line. That is harmless
 * in a Lambda container, which is the double-fire scenario the flag exists for.
 */
@Injectable()
export class ScheduleReminderCronService implements OnModuleInit {
  private readonly logger = new Logger(ScheduleReminderCronService.name);

  constructor(
    private readonly scheduleReminderService: ScheduleReminderService,
  ) {}

  /** True only for the exact string 'true'. */
  private isEnabled(): boolean {
    return process.env[SCHEDULE_REMINDER_CRON_FLAG] === 'true';
  }

  /**
   * Boot line proving which state the cron mounted in. Runs after ConfigModule
   * has populated process.env, so it reports the value the handler will see.
   */
  onModuleInit(): void {
    if (this.isEnabled()) {
      this.logger.log(
        `Schedule reminder cron ARMED (${SCHEDULE_REMINDER_CRON_FLAG}=true), schedule "${CRON_EXPRESSION}" server-local.`,
      );
    } else {
      this.logger.log(
        `Schedule reminder cron INERT (${SCHEDULE_REMINDER_CRON_FLAG} is not 'true'). ` +
          `The daily trigger will fire and return without sweeping.`,
      );
    }
  }

  @Cron(CRON_EXPRESSION)
  async handleScheduleReminderCron(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug(
        `Schedule reminder sweep skipped: ${SCHEDULE_REMINDER_CRON_FLAG} is not 'true'.`,
      );
      return;
    }

    const startedAt = Date.now();
    this.logger.log('----- Schedule reminder sweep: START -----');

    try {
      const summary = await this.scheduleReminderService.runSweep();

      for (const skipped of summary.orgsSkipped) {
        this.logger.log(`  org ${skipped.orgID}: skipped — ${skipped.reason}`);
      }

      for (const cohort of summary.cohorts) {
        this.logger.log(
          `  org ${cohort.orgID} ${cohort.cohortKey} [${cohort.leg}/${cohort.mode}] ` +
            `period=${cohort.periodKey} cutoff=${cohort.cutoffAt} ` +
            `unbooked=${cohort.unbookedFound} sent=${cohort.remindersSent} ` +
            `alreadyReminded=${cohort.alreadyReminded} noDeviceToken=${cohort.missingDeviceToken} ` +
            `dispatchFailed=${cohort.dispatchFailed}`,
        );
      }

      for (const error of summary.errors) {
        this.logger.warn(`  non-fatal: ${error}`);
      }

      this.logger.log(
        `----- Schedule reminder sweep: DONE in ${
          Date.now() - startedAt
        }ms — ` +
          `orgs=${summary.orgsConsidered} skipped=${summary.orgsSkipped.length} ` +
          `cohorts=${summary.cohorts.length} sent=${summary.totalRemindersSent} ` +
          `errors=${summary.errors.length} -----`,
      );
    } catch (error) {
      // runSweep already contains per-org and per-employee failures. Anything
      // reaching here is a failure of the sweep itself (e.g. the organization
      // query). Swallow it: an unhandled rejection out of a cron handler can
      // take down the host process, and a missed reminder must never do that.
      this.logger.error(
        `----- Schedule reminder sweep: FAILED after ${
          Date.now() - startedAt
        }ms — ${error?.message ?? error} -----`,
        error?.stack,
      );
    }
  }
}
