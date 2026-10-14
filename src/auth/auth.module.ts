import { Module, forwardRef } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule } from '@nestjs/config';
import { Session } from 'src/auth/models/session.model';
import { JsonWebTokenService } from '../shared/utils/jwt';
import { AdminAuthController } from './controllers/admin.auth.controller';
import { EmailModule } from 'src/email/email.module';
import { UserModule } from 'src/user/user.module';
import { User } from 'src/user/models/user.model';
import { SmsModule } from 'src/sms/sms.module';
import { AuthService } from './services/auth.service';
import { SessionService } from './services/session.service';
import { Authentication } from './models/authentication.model';
import { PasswordModule } from 'src/password-management/password/password.module';
import { PasswordHistoryModule } from 'src/password-management/password-history/password-history.module';
import { AdminUserController } from './controllers/admin.administrator.controller';
import { AdminService } from './services/admin.service';
import { EventLogModule } from 'src/eventlog/eventlog.module';
import { EmployeeAuthController } from './controllers/employee.auth.controller';
import { VendorAuthController } from './controllers/vendor.auth.controller';
import { DriverAuthController } from './controllers/driver.auth.controller';
import { DriverAuthService } from './services/driver.auth.service';
import { DriverAuthentication } from './models/driver-auth.model';
import { Driver } from 'src/drivers/models/driver.model';
import { Organization } from 'src/organization/models/organization.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { OktaAuthController } from './controllers/okta.auth.controller';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { Employee } from 'src/employee/models/employee.model';
import { EmployeeDeviceInfo } from './models/employee-device-model';
import { DriverDeviceInfo } from './models/driver-device-model';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { RateLimitGuard } from './guards/rate-limit.guard';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Session,
      User,
      Authentication,
      DriverAuthentication,
      Driver,
      Organization,
      Vendor,
      Employee,
      EmployeeDeviceInfo,
      DriverDeviceInfo,
    ]),
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule,
    EmailModule,
    forwardRef(() => UserModule),
    forwardRef(() => SmsModule),
    PasswordModule,
    PasswordHistoryModule,
    forwardRef(() => EventLogModule),
    ConfigurationModule,
    NotificationsModule,
  ],
  controllers: [
    AdminAuthController,
    AdminUserController,
    EmployeeAuthController,
    VendorAuthController,
    DriverAuthController,
    OktaAuthController,
  ],
  providers: [
    JwtStrategy,
    JsonWebTokenService,
    AuthService,
    SessionService,
    AdminService,
    DriverAuthService,
    RateLimitGuard,
  ],
  exports: [
    JsonWebTokenService,
    AuthService,
    SessionService,
    DriverAuthService,
  ],
})
export class AuthModule {}
