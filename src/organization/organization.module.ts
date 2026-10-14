import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Organization } from './models/organization.model';
import { OrganizationService } from './services/organization.service';
import { OrganizationController } from './controllers/organization.controller';
import { EmployeeModule } from 'src/employee/employee.module';
// import { PasswordModule } from 'src/password-management/password/password.module';
import { PasswordHistoryModule } from 'src/password-management/password-history/password-history.module';
import { Authentication } from 'src/auth/models/authentication.model';
import { AuthModule } from 'src/auth/auth.module';
import { Role } from 'src/role/models/role.model';
import { Session } from 'src/auth/models/session.model';
import { UploadModule } from 'src/upload/upload.module';
import { ConfigModule } from 'node_modules/@nestjs/config';
import { Employee } from 'src/employee/models/employee.model';
@Module({
  imports: [
    SequelizeModule.forFeature([
      Organization,
      Authentication,
      Role,
      Session,
      Employee,
    ]),
    forwardRef(() => EmployeeModule),
    // forwardRef(() => PasswordModule),
    PasswordHistoryModule,
    UploadModule,
    forwardRef(() => AuthModule),
    forwardRef(() => ConfigModule),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
