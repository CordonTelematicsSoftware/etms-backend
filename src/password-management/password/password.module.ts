import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PasswordHistory } from '../password-history/models/password-history.model';
import { PasswordService } from './services/password.service';
import { PasswordController } from './controllers/password.controller';
import { PasswordHistoryModule } from '../password-history/password-history.module';
import { Employee } from 'src/employee/models/employee.model';
import { Organization } from 'src/organization/models/organization.model';
import { ConfigurationMaster } from 'src/config-management/config/models/config.model';
import { CompanyConfiguration } from 'src/config-management/company-config/models/company-config.model';
import { EmployeeModule } from 'src/employee/employee.module';
import { ConfigurationModule } from 'src/config-management/config/config.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      PasswordHistory,
      Employee,
      Organization,
      ConfigurationMaster,
      CompanyConfiguration,
    ]),
    PasswordHistoryModule,
    EmployeeModule,
    ConfigurationModule,
  ],
  providers: [PasswordService],
  exports: [PasswordService],
  controllers: [PasswordController],
})
export class PasswordModule {}
