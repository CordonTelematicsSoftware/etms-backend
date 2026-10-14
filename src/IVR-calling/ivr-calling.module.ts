import { forwardRef, Module } from '@nestjs/common';
import { IVRCallingController } from './controller/ivr-calling.controller';
import { IVRCallingService } from './service/ivr-calling.service';
import { TripModule } from 'src/trip-management/trip/trip.module';
import { EmployeeModule } from 'src/employee/employee.module';
import { DriverModule } from 'src/drivers/driver.module';
import { SafeHomeIVRHistory } from './models/safeHomeIVRHistory.model';
import { SequelizeModule } from 'node_modules/@nestjs/sequelize';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { Alert } from 'src/alerts/models/alert.model';
import { AlertModule } from 'src/alerts/alert.module';
import { EmailModule } from 'src/email/email.module';
import { Employee } from 'src/employee/models/employee.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';

@Module({
  imports: [
    // The safe-home outcome handlers read/write these directly rather than
    // going through TripRequestService or AlertService: both would pull in a
    // module that already imports IVRCallingModule. Registering the models is
    // DI-token-only and adds no module edge.
    SequelizeModule.forFeature([
      SafeHomeIVRHistory,
      TripRequest,
      Trip,
      Employee,
      Alert,
    ]),
    forwardRef(() => TripModule),
    forwardRef(() => EmployeeModule),
    forwardRef(() => DriverModule),
    ConfigurationModule,
    EmailModule,
    // AlertModule is imported only for SosGateway. Its transitive closure
    // (Notifications, Configuration, Email, CordonGps) reaches none of
    // Trip/TripRequest/IVRCalling, so this introduces no cycle.
    AlertModule,
  ],
  controllers: [IVRCallingController],
  providers: [IVRCallingService],
  exports: [IVRCallingService],
})
export class IVRCallingModule {}
