import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { EmployeeService } from './services/employee-service';
import { Employee } from './models/employee.model';
import { EmployeeController } from './controller/employee-controller';
import { ProfileModule } from 'src/profile/profile.module';
import { AuthModule } from 'src/auth/auth.module';
import { Authentication } from 'src/auth/models/authentication.model';
import { GoogleMapModule } from 'src/google-maps/google-map-module';
import { OrganizationModule } from 'src/organization/organization.module';
import { Profile } from 'src/profile/model/profile.model';
import { EmployeeAutoZoneController } from './controller/employee-auto-zone.controller';
import { EmployeeAutoZoneService } from './services/employee-auto-zone.service';
import { Location } from 'src/location-management/locations/models/location.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { Team } from 'src/team/models/team.model';
import { Process } from 'src/process/models/process.model';
import { ApprovalRequest } from 'src/approval-request/models/approval-request.model';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { EmailModule } from 'src/email/email.module';
import { AdministratorModule } from 'src/administrator/administrator.module';
import { EmployeeDeviceInfo } from 'src/auth/models/employee-device-model';
import { Role } from 'src/role/models/role.model';
import { CommonPoint } from 'src/location-management/commonPoints/models/commonPoint.model';
import { Costcenter } from 'src/costcenter/model/costcenter.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Employee,
      Authentication,
      Profile,
      Location,
      Trip,
      TripRequest,
      Team,
      Process,
      ApprovalRequest,
      EmployeeDeviceInfo,
      Role,
      CommonPoint,
      Costcenter,
    ]),
    ProfileModule,
    forwardRef(() => AuthModule),
    forwardRef(() => GoogleMapModule),
    forwardRef(() => OrganizationModule),
    forwardRef(() => ConfigurationModule),
    forwardRef(() => AdministratorModule),
    EmailModule,
  ],
  providers: [EmployeeService, EmployeeAutoZoneService],
  exports: [EmployeeService],
  controllers: [EmployeeController, EmployeeAutoZoneController],
})
export class EmployeeModule {}
