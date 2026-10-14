import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { TripRequest } from './models/trip-request.model';
import { TripRequestController } from './controllers/trip-request.controller';
import { TripRequestService } from './services/trip-request.service';
import { EmployeeModule } from 'src/employee/employee.module';
import { Employee } from 'src/employee/models/employee.model';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { TripModule } from '../trip/trip.module';
import { MobTripRequestController } from './controllers/mob.trip-request.controller';
import { MobTripRequestService } from './services/mob.trip-request.service';
import { Trip } from '../trip/models/trip.model';
import { Security } from 'src/security/models/security.model';
import { NotificationsModule } from 'src/notifications';
import { Profile } from 'src/profile/model/profile.model';
import { Authentication } from 'src/auth/models/authentication.model';
import { EmailModule } from 'src/email/email.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      TripRequest,
      Employee,
      Trip,
      Security,
      Profile,
      Authentication,
    ]),
    EmployeeModule,
    ConfigurationModule,
    TripModule,
    NotificationsModule,
    EmailModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [TripRequestController, MobTripRequestController],
  providers: [TripRequestService, MobTripRequestService],
  exports: [TripRequestService],
})
export class TripRequestModule {}
