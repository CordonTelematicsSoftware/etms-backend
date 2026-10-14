import { Module } from '@nestjs/common';
import { OrganizationDriverController } from './controllers/organization-driver.controller';
import { OrganizationDriverService } from './services/organization-driver.service';
import { SequelizeModule } from 'node_modules/@nestjs/sequelize';
import { OrganizationDriver } from './models/organizationDriver.model';
import { DriverModule } from 'src/drivers/driver.module';
import { DriverOrgRequestDocumentUpload } from 'src/approval-request/models/driver-org-req-document-upload.model';
import { OrgDriverRequest } from 'src/approval-request/models/driver-org-approval-req.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      OrganizationDriver,
      OrgDriverRequest,
      DriverOrgRequestDocumentUpload,
      Trip,
    ]),
    DriverModule,
  ],
  controllers: [OrganizationDriverController],
  providers: [OrganizationDriverService],
  exports: [OrganizationDriverService],
})
export class OrganizationDriverModule {}
