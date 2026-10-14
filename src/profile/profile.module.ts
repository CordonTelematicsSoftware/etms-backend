import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProfileService } from './service/profile.service';
import { Profile } from './model/profile.model';
import { ProfileController } from './controller/profile.controller';
import { Employee } from 'src/employee/models/employee.model';
import { Authentication } from 'src/auth/models/authentication.model';
import { VendorUser } from 'src/vendor-management/vendor-user/models/vendor-user.model';
import { UserProfileController } from './controller/userProfile.controller';
import { EmployeeModule } from 'src/employee/employee.module';
import { VendorUserModule } from 'src/vendor-management/vendor-user/vendor-user.module';
import { UploadModule } from 'src/upload/upload.module';
import { AuthModule } from 'src/auth/auth.module';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { ApprovalRequest } from 'src/approval-request/models/approval-request.model';
import { EmailModule } from 'src/email/email.module';
import { Organization } from 'src/organization/models/organization.model';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Profile,
      Employee,
      Authentication,
      VendorUser,
      ApprovalRequest,
      Organization,
    ]),
    forwardRef(() => EmployeeModule),
    forwardRef(() => VendorUserModule),
    forwardRef(() => AuthModule),
    ConfigurationModule,
    UploadModule,
    EmailModule,
    NotificationsModule,
  ],
  controllers: [ProfileController, UserProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
