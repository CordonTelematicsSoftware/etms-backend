import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Cab } from './models/cab.model';
import { CabController } from './controller/cab.controller';
import { CabService } from './services/cab.service';
import { Brand } from 'src/brands/models/brand.model';
import { Driver } from 'src/drivers/models/driver.model';
import { UploadModule } from 'src/upload/upload.module';
import { CabDocumentUpload } from './models/cabDocumentUpload.model';
import { OrganizationCab } from 'src/organization-cab/models/organizationCab.model';
import { ApprovalRequest } from 'src/approval-request/models/approval-request.model';
import { Organization } from 'src/organization/models/organization.model';
import { EmailModule } from 'src/email/email.module';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { Employee } from 'src/employee/models/employee.model';
import { CabOrgRequest } from 'src/approval-request/models/cab-org-approval-req.model';
import { CabOrgRequestDocumentUpload } from 'src/approval-request/models/cab-org-req-document-upload.model';
import { Authentication } from 'src/auth/models/authentication.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Cab,
      Brand,
      Driver,
      CabDocumentUpload,
      OrganizationCab,
      ApprovalRequest,
      Organization,
      Employee,
      CabOrgRequest,
      CabOrgRequestDocumentUpload,
      Authentication,
    ]),
    CabModule,
    UploadModule,
    ConfigurationModule,
    EmailModule,
  ],
  controllers: [CabController],
  providers: [CabService],
  exports: [CabService],
})
export class CabModule {}
