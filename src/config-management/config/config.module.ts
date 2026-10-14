import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { ConfigurationMaster } from './models/config.model';
import { ConfigurationService } from './services/config.service';
import { AdminConfigController } from './controllers/admin-config.controller';
import { CompanyConfigModule } from '../company-config/company-config.module';
import { CompanyConfiguration } from '../company-config/models/company-config.model';
import { Organization } from 'src/organization/models/organization.model';
import { OktaConfigController } from './controllers/okta-config.controller';
import { EmployeeModule } from 'src/employee/employee.module';
import { DriverConfigController } from './controllers/driver-config.controller';
import { OrganizationDriver } from 'src/organization-driver/models/organizationDriver.model';
import { EmailModule } from 'src/email/email.module';
import { Employee } from 'src/employee/models/employee.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      ConfigurationMaster,
      CompanyConfiguration,
      Organization,
      OrganizationDriver,
      Employee,
    ]),
    CompanyConfigModule,
    EmailModule,
    forwardRef(() => EmployeeModule),
    // forwardRef(() => OrganizationModule),
  ],
  providers: [ConfigurationService],
  exports: [ConfigurationService],
  controllers: [
    AdminConfigController,
    OktaConfigController,
    DriverConfigController,
  ],
})
export class ConfigurationModule {}
