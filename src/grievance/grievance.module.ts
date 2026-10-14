import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Grievance } from './models/grievance.model';
import { GrievanceService } from './services/grievance.service';
import { GrievanceController } from './controllers/grievance.controller';
import { UploadService } from 'src/upload/services/upload.service';
import { EmailModule } from 'src/email/email.module';
import { GmsCategoryModule } from 'src/gms-category/gms-category.module';
import { EmployeeModule } from 'src/employee/employee.module';
import { GrievanceHistory } from './models/grievanceHistory.model';
import { GrievanceHistoryService } from './services/grievanceHistory.service';
import { GrievanceHistoryController } from './controllers/grievanceHistory.controller';
import { EmployeeGrievanceService } from './services/employeeGrievance.service';
import { EmployeeGrievanceController } from './controllers/employeeGrievance.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([Grievance, GrievanceHistory]),
    EmailModule,
    GmsCategoryModule,
    EmployeeModule,
  ],
  providers: [
    GrievanceService,
    UploadService,
    GrievanceHistoryService,
    EmployeeGrievanceService,
  ],
  exports: [
    GrievanceService,
    GrievanceHistoryService,
    EmployeeGrievanceService,
  ],
  controllers: [
    GrievanceController,
    GrievanceHistoryController,
    EmployeeGrievanceController,
  ],
})
export class GrievanceModule {}
