import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { EmployeeModule } from 'src/employee/employee.module';
import { Trip } from './models/trip.model';
import { TripController } from './controllers/trip.controller';
import { TripService } from './services/trip.service';
import { TripRequest } from '../trip-request/models/trip-request.model';
import { Employee } from 'src/employee/models/employee.model';
import { TripRequestModule } from '../trip-request/trip-request.module';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { BillingConfigurationModule } from 'src/billing-module/billing-configuration.module';
import { TripActualsService } from './services/trip-actuals.service';
import { TripActual } from './models/trip-actual.model';
import { DriverTripController } from './controllers/driver.trip.controller';
import { DriverTripService } from './services/driver.trip.services';
import { TripActualController } from './controllers/trip-actuals.controller';
import { EmployeeMobApiTripController } from './controllers/employee.mob-api.trip.controller';
import { MobApiTripService } from './services/mob-api.trip.service';
import { SpocTripController } from './controllers/spoc.trip.controller';
import { SpocTripService } from './services/spoc.trip.services';
import { OrganizationModule } from 'src/organization/organization.module';
import { GoogleMapModule } from 'src/google-maps/google-map-module';
import { DriverMobApiTripController } from './controllers/driver.mob-api.trip.controller';
import { EmployeeEstTimeCalculationService } from 'src/employee/services/employee-est-time-calculation.service';
import { VendorRequest } from 'src/vendor-management/vendor-request/models/vendor-request.model';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { SecurityAttendance } from 'src/security/models/securityAttendance.model';
import { Security } from 'src/security/models/security.model';
import { SmsModule } from 'src/sms/sms.module';
import { Organization } from 'src/organization/models/organization.model';
import { TripCronService } from './services/trip-cron.service';
import { ConfigurationMaster } from 'src/config-management/config/models/config.model';
import { CompanyConfiguration } from 'src/config-management/company-config/models/company-config.model';
import { Alert } from 'src/alerts/models/alert.model';
import { EmployeeTripOtp } from 'src/employee/models/employee-trip-otp.model';
import { OrganizationCab } from 'src/organization-cab/models/organizationCab.model';
import { OrganizationDriver } from 'src/organization-driver/models/organizationDriver.model';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { Profile } from 'src/profile/model/profile.model';
import { CordonGpsModule } from 'src/cordon-gps/cordon-gps.module';
import { IVRCallingModule } from 'src/IVR-calling/ivr-calling.module';
import { EmailModule } from 'src/email/email.module';
import { DriverOverspeed } from './models/driver-overspeed.model';
import { Driver } from 'src/drivers/models/driver.model';
import { Cab } from 'src/cabs/models/cab.model';
import { DriverDeviceInfo } from 'src/auth/models/driver-device-model';
import { TripSaveJob } from './models/trip-save-job.model';
import { TripSaveJobService } from './services/trip-save-job.service';
import { TripSaveJobWorkerService } from './services/trip-save-job-worker.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Trip,
      TripRequest,
      Employee,
      EmployeeTripOtp,
      Vendor,
      Driver,
      Cab,
      DriverDeviceInfo,
      TripActual,
      VendorRequest,
      Security,
      SecurityAttendance,
      Organization,
      ConfigurationMaster,
      CompanyConfiguration,
      Alert,
      OrganizationCab,
      OrganizationDriver,
      Profile,
      DriverOverspeed,
      TripSaveJob,
    ]),
    forwardRef(() => TripRequestModule),
    EmployeeModule,
    BillingConfigurationModule,
    OrganizationModule,
    GoogleMapModule,
    ConfigurationModule,
    SmsModule,
    IVRCallingModule,
    NotificationsModule,
    CordonGpsModule,
    EmailModule,
  ],
  controllers: [
    TripController,
    DriverTripController,
    TripActualController,
    EmployeeMobApiTripController,
    SpocTripController,
    DriverMobApiTripController,
  ],
  providers: [
    TripService,
    TripActualsService,
    DriverTripService,
    MobApiTripService,
    SpocTripService,
    EmployeeEstTimeCalculationService,
    TripCronService,
    TripSaveJobService,
    TripSaveJobWorkerService,
  ],
  exports: [TripService, DriverTripService],
})
export class TripModule {}
