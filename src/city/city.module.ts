import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { City } from './models/city.model';
import { CityController } from './controllers/city.controller';
import { CityService } from './services/city.service';
import { EventLogModule } from 'src/eventlog/eventlog.module';
import { Organization } from 'src/organization/models/organization.model';
@Module({
  imports: [
    SequelizeModule.forFeature([City, Organization]),
    forwardRef(() => EventLogModule),
  ],
  controllers: [CityController],
  providers: [CityService],
  exports: [CityService],
})
export class CityModule {}
