import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { ReportExportController } from './controller/report-export.controller';
import { TripReportExportService } from './service/trip-report-export.service';
import { TripRequestReportExportService } from './service/trip-req-report-export.service';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { TripReportService } from 'src/reports/services/trip-report.service';
import { EmployeeReportExportService } from './service/employee-report-export.service';
import { Employee } from 'src/employee/models/employee.model';
import { Alert } from 'src/alerts/models/alert.model';
import { AlertReportExportService } from './service/alert-report-export.service';
import { NotificationLog } from 'src/notifications/models/notification-log.model';
import { SafeHomeIVRHistory } from 'src/IVR-calling/models/safeHomeIVRHistory.model';
import { ReportModule } from 'src/reports/report.module';
import { DriverOverspeed } from 'src/trip-management/trip/models/driver-overspeed.model';
import { DriverOverspeedReportService } from 'src/reports/services/driver-overspeed-report.service';

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
    // Brings in SafeHomeReportService for the safe-home export twin.
    ReportModule,
  ],
  controllers: [ReportExportController],
  providers: [
    TripReportExportService,
    TripRequestReportExportService,
    TripReportService,
    EmployeeReportExportService,
    AlertReportExportService,
    DriverOverspeedReportService,
  ],
  //   exports: [LocationService],
})
export class ReportExportModule {}
