import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Route } from './models/route.model';
import { RouteController } from './controllers/route.controller';
import { RouteService } from './services/route.service';
import { EventLogModule } from 'src/eventlog/eventlog.module';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { TripRequestModule } from 'src/trip-management/trip-request/trip-request.module';
import { LocationModule } from 'src/location-management/locations/location.module';
import { Location } from 'src/location-management/locations/models/location.model';
import { AutoRouteController } from './controllers/autoroute.controller';
import { AutoRouteService } from './services/autoroute.service';
import { TripModule } from 'src/trip-management/trip/trip.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Route, TripRequest, Location]),
    forwardRef(() => EventLogModule),
    forwardRef(() => ConfigurationModule),
    forwardRef(() => TripRequestModule),
    forwardRef(() => TripModule),
    forwardRef(() => LocationModule),
  ],
  controllers: [RouteController, AutoRouteController],
  providers: [RouteService, AutoRouteService],
  exports: [RouteService],
})
export class RouteModule {}
