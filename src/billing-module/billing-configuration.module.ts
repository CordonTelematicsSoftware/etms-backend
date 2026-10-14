import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BillingConfigurationService } from './services/billing-configuration.service';
import { BillingConfigurationController } from './controller/billing-configuration.controller';
import { BillingRate } from './models/billing-rate.model';
import { TripBillingReportController } from './controller/trip-report.controller';
import { TripBillingReportService } from './services/trip-report.service';
import { Trip } from 'src/trip-management/trip/models/trip.model';

@Module({
  imports: [SequelizeModule.forFeature([BillingRate, Trip])],
  providers: [BillingConfigurationService, TripBillingReportService],
  controllers: [BillingConfigurationController, TripBillingReportController],
  exports: [BillingConfigurationService, TripBillingReportService],
})
export class BillingConfigurationModule {}
