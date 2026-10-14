// src/report/report.module.ts
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ReportController } from './controller/report.controller';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { TripReportService } from './services/trip-report.service';
import { TripRequestReportService } from './services/trip-request-report.service';
import { Employee } from 'src/employee/models/employee.model';
import { EmployeeReportService } from './services/employee-report.service';
import { Alert } from 'src/alerts/models/alert.model';
import { AlertReportService } from './services/alert-report.service';
import { NotificationLog } from 'src/notifications/models/notification-log.model';
import { SafeHomeIVRHistory } from 'src/IVR-calling/models/safeHomeIVRHistory.model';
import { SafeHomeReportService } from './services/safe-home-report.service';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { DriverOverspeed } from 'src/trip-management/trip/models/driver-overspeed.model';
import { DriverOverspeedReportService } from './services/driver-overspeed-report.service';
// PARKED: TR Report Requests/Latest — needs (orgID,date) index.
// import { TripRequestGroupService } from './services/trip-request-group.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Trip,
      TripRequest,
      Employee,
      Alert,
      NotificationLog,
      SafeHomeIVRHistory,
      DriverOverspeed,
    ]),
    ConfigurationModule,
  ],
  controllers: [ReportController],
  providers: [
    TripReportService,
    TripRequestReportService,
    EmployeeReportService,
    AlertReportService,
    SafeHomeReportService,
    DriverOverspeedReportService,
    // PARKED: TR Report Requests/Latest — needs (orgID,date) index.
    // TripRequestGroupService,
  ],
  exports: [
    TripReportService,
    TripRequestReportService,
    EmployeeReportService,
    AlertReportService,
    SafeHomeReportService,
    DriverOverspeedReportService,
    // PARKED: TR Report Requests/Latest — needs (orgID,date) index.
    // // Exported so the export twin (ReportExportModule imports ReportModule) shares the
    // // same slot-grouping SQL instead of duplicating it.
    // TripRequestGroupService,
  ],
})
export class ReportModule {}
