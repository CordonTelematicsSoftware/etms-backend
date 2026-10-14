import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Driver } from './models/driver.model';
import { DriverController } from './controller/driver.controller';
import { DriverService } from './services/driver.service';
import { AuthModule } from 'src/auth/auth.module';
import { DriverAuthentication } from 'src/auth/models/driver-auth.model';
import { VendorUser } from 'src/vendor-management/vendor-user/models/vendor-user.model';
import { DriverDocumentUpload } from './models/driverDocumentUpload.model';
import { UploadModule } from 'src/upload/upload.module';
import { OrganizationDriver } from 'src/organization-driver/models/organizationDriver.model';
import { EmailModule } from 'src/email/email.module';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { DriverOrgRequestDocumentUpload } from 'src/approval-request/models/driver-org-req-document-upload.model';
import { OrgDriverRequest } from 'src/approval-request/models/driver-org-approval-req.model';
import { Employee } from 'src/employee/models/employee.model';
import { ApprovalRequest } from 'src/approval-request/models/approval-request.model';
import { Authentication } from 'src/auth/models/authentication.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Driver,
      DriverAuthentication,
      VendorUser,
      DriverDocumentUpload,
      OrganizationDriver,
      ApprovalRequest,
      Employee,
      OrgDriverRequest,
      DriverOrgRequestDocumentUpload,
      Authentication,
    ]),
    DriverModule,
    UploadModule,
    ConfigurationModule,
    EmailModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
