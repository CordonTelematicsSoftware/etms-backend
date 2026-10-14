import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Alert } from './models/alert.model';
import { MobAlertController } from './controllers/mob-alert.controller';
import { DriverAlertController } from './controllers/driver-alert.controller';
import { AdminAlertController } from './controllers/admin-alert.controller';
import { AlertService } from './services/alert.service';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { SosGateway } from './gateways/sos.gateway';
import { Driver } from 'src/drivers/models/driver.model';
import { EmailModule } from 'src/email/email.module';
import { Employee } from 'src/employee/models/employee.model';
import { CordonGpsModule } from 'src/cordon-gps/cordon-gps.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Alert, Trip, Driver, Employee]),
    NotificationsModule,
    ConfigurationModule,
    EmailModule,
    CordonGpsModule,
    AuthModule,
  ],
  controllers: [
    AdminAlertController,
    DriverAlertController,
    MobAlertController,
  ],
  providers: [AlertService, SosGateway],
  exports: [AlertService, SosGateway],
})
export class AlertModule {}
