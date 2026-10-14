import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';

import { Organization } from 'src/organization/models/organization.model';
import { Status } from 'src/shared/enums';

import { ScheduleReminderGeneratorService } from './schedule-reminder-generator.service';

/** Nightly rebuild. Off-peak, and well before any 05:00 shift window opens. */
const CRON_EXPRESSION = '0 2 * * *';

const GENERATOR_FLAG = 'SCHEDULE_REMINDER_HOURLY_ENABLED';

/**
 * Rebuilds the hourly reminder schedule for every active org, once a night.
 *
 * This is the safety net, not the only path: the config and team write paths
 * regenerate their own org on change. The nightly pass exists because direct
 * DB edits bypass every hook, and because the horizon has to roll forward a
 * day at a time regardless of whether anyone edited anything.
 *
 * Cheap by construction — a handful of queries per org writing a few hundred
 * rows, against the employee sweep's thousands of row reads.
 */
@Injectable()
export class ScheduleReminderGeneratorCronService {
  private readonly logger = new Logger(
    ScheduleReminderGeneratorCronService.name,
  );

  constructor(
    @InjectModel(Organization)
    private readonly organizationModel: typeof Organization,
    private readonly generator: ScheduleReminderGeneratorService,
  ) {}

  @Cron(CRON_EXPRESSION)
  async handleNightlyRebuild(): Promise<void> {
    // Flag read inside the handler, not at module definition — ConfigModule
    // has not populated process.env when providers are constructed.
    if (process.env[GENERATOR_FLAG] !== 'true') {
      return;
    }

    const startedAt = Date.now();
    const orgs = await this.organizationModel.findAll({
      where: { status: Status.Active },
      attributes: ['id', 'name'],
    });

    let created = 0;
    let deleted = 0;
    const errors: string[] = [];

    for (const org of orgs) {
      try {
        const result = await this.generator.generateForOrg(org.id);
        created += result.rowsCreated;
        deleted += result.rowsDeleted;

        for (const skip of result.skipped) {
          this.logger.log(
            `  org ${org.id} ${skip.scope}: skipped — ${skip.reason}`,
          );
        }
      } catch (error: any) {
        // One org's bad config must not abort the rebuild for the rest.
        const message = `org ${org.id}: ${error?.message ?? error}`;
        errors.push(message);
        this.logger.error(message, error?.stack);
      }
    }

    const pruned = await this.generator.prune();

    this.logger.log(
      `----- Hourly schedule rebuild: DONE in ${Date.now() - startedAt}ms — ` +
        `orgs=${orgs.length} created=${created} deleted=${deleted} ` +
        `pruned=${pruned} errors=${errors.length} -----`,
    );
  }
}
