import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { EventLogModule } from 'src/eventlog/eventlog.module';
import { Organization } from 'src/organization/models/organization.model';
import { ReportScheduler } from './models/report-scheduler.model';
import { ReportSchedulerController } from './controllers/report-scheduler.controller';
import { ReportSchedulerService } from './services/report-scheduler.service';
import { CronReportSchedulerService } from './services/cron-report-scheduler.service';
import { EmailModule } from 'src/email/email.module';
import { ReportModule } from 'src/reports/report.module';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { BillingConfigurationModule } from 'src/billing-module/billing-configuration.module';
import { GrievanceModule } from 'src/grievance/grievance.module'; // adjust path to actual location

@Module({
  imports: [
    SequelizeModule.forFeature([ReportScheduler, Organization]),
    forwardRef(() => EventLogModule),
    EmailModule,
    ReportModule,
    ConfigurationModule,
    BillingConfigurationModule,
    GrievanceModule,
  ],
  controllers: [ReportSchedulerController],
  providers: [ReportSchedulerService, CronReportSchedulerService],
  exports: [ReportSchedulerService, CronReportSchedulerService],
})
export class ReportSchedulerModule {}
