import { Module } from '@nestjs/common';
import { ApprovalRequestController } from './controllers/approval-request.controller';
import { ApprovalRequestService } from './services/approval-request.service';
import { ApprovalRequest } from './models/approval-request.model';
import { SequelizeModule } from 'node_modules/@nestjs/sequelize';
import { Authentication } from 'src/auth/models/authentication.model';
import { Employee } from 'src/employee/models/employee.model';
import { Profile } from 'src/profile/model/profile.model';
import { EmailModule } from 'src/email/email.module';
import { Cab } from 'src/cabs/models/cab.model';
import { CabOrgRequest } from './models/cab-org-approval-req.model';
import { CabOrgRequestDocumentUpload } from './models/cab-org-req-document-upload.model';
import { Driver } from 'src/drivers/models/driver.model';
import { OrgDriverRequest } from './models/driver-org-approval-req.model';
import { DriverOrgRequestDocumentUpload } from './models/driver-org-req-document-upload.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      ApprovalRequest,
      Profile,
      Employee,
      Authentication,
      Cab,
      Driver,
      CabOrgRequest,
      CabOrgRequestDocumentUpload,
      OrgDriverRequest,
      DriverOrgRequestDocumentUpload,
    ]),
    EmailModule,
  ],
  controllers: [ApprovalRequestController],
  providers: [ApprovalRequestService],
  exports: [ApprovalRequestService],
})
export class ApprovalRequestModule {}
