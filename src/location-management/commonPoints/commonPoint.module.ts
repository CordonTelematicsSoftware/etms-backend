import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { CommonPoint } from './models/commonPoint.model';
import { CommonPointController } from './controller/commonpoint.controller';
import { CommonPointService } from './services/commonPoint.service';
import { EmployeeModule } from 'src/employee/employee.module';

@Module({
  imports: [SequelizeModule.forFeature([CommonPoint]), EmployeeModule],
  controllers: [CommonPointController],
  providers: [CommonPointService],
  exports: [CommonPointService],
})
export class CommonPointModule {}
