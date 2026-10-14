import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { Employee } from 'src/employee/models/employee.model';
import { EmployeeDeviceInfo } from 'src/auth/models/employee-device-model';
import { Organization } from 'src/organization/models/organization.model';
import { Team } from 'src/team/models/team.model';
import { ConfigurationMaster } from 'src/config-management/config/models/config.model';
import { CompanyConfiguration } from 'src/config-management/company-config/models/company-config.model';
import { NotificationsModule } from 'src/notifications/notifications.module';

import { ScheduleReminderLog } from './models/schedule-reminder-log.model';
import { ScheduleReminderService } from './services/schedule-reminder.service';
import { ScheduleReminderCronService } from './services/schedule-reminder-cron.service';
import { ScheduleReminderSchedule } from './models/schedule-reminder-schedule.model';
import { ShiftTimeResolverService } from './services/shift-time-resolver.service';
import { ScheduleReminderGeneratorService } from './services/schedule-reminder-generator.service';
import { ScheduleReminderGeneratorCronService } from './services/schedule-reminder-generator-cron.service';
import { ScheduleReminderPollerService } from './services/schedule-reminder-poller.service';

/**
 * Schedule-cutoff reminder.
 *
 * Self-contained: it imports NotificationsModule only to reach the existing
 * NotificationDispatcherService, and registers the models it reads. It does not
 * import TripRequestModule or ConfigurationModule — the cutoff maths and the
 * org-config read are replicated read-only inside this module so no existing
 * service is coupled to, or changed by, the reminder.
 *
 * TripRequests is read through a raw NOT EXISTS subquery rather than the
 * TripRequest model, so the model is deliberately not registered here.
 *
 * The cron provider is registered unconditionally, but is INERT unless
 * SCHEDULE_REMINDER_CRON_ENABLED === 'true' at runtime. The gate lives in the
 * handler body rather than in this providers array on purpose — see the header
 * of schedule-reminder-cron.service.ts for why a module-definition-time
 * process.env read would misread a flag set in .env.
 *
 * ScheduleModule.forRoot() is already registered globally in app.module.ts:67,
 * so the @Cron mounts as soon as this provider exists — no extra import needed.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      ScheduleReminderLog,
      ScheduleReminderSchedule,
      Employee,
      EmployeeDeviceInfo,
      Organization,
      Team,
      ConfigurationMaster,
      CompanyConfiguration,
    ]),
    NotificationsModule,
  ],
  providers: [
    ScheduleReminderService,
    ScheduleReminderCronService,
    ShiftTimeResolverService,
    ScheduleReminderGeneratorService,
    ScheduleReminderGeneratorCronService,
    ScheduleReminderPollerService,
  ],
  exports: [ScheduleReminderService],
})
export class ScheduleReminderModule {}
