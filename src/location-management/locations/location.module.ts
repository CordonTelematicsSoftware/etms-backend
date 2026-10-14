import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Location } from './models/location.model';
import { LocationController } from './controller/location.controller';
import { LocationService } from './services/location.service';
import { EmployeeModule } from 'src/employee/employee.module';
import { Route } from 'src/routes/models/route.model';
// import { RouteModule } from 'src/routes/route.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Location, Route]),
    EmployeeModule,
    // RouteModule,
  ],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
