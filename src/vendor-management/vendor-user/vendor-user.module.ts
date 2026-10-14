import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { VendorUser } from './models/vendor-user.model';
import { VendorUserController } from './controllers/vendor-user.controller';
import { VendorUserService } from './services/vendor-user.service';
import { AuthModule } from 'src/auth/auth.module';
import { Authentication } from 'src/auth/models/authentication.model';
import { Session } from 'src/auth/models/session.model';
import { VendorRequest } from '../vendor-request/models/vendor-request.model';
import { PasswordHistoryModule } from 'src/password-management/password-history/password-history.module';
import { PasswordModule } from 'src/password-management/password/password.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      VendorUser,
      Authentication,
      Session,
      VendorRequest,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => PasswordModule),
    PasswordHistoryModule,
  ],
  controllers: [VendorUserController],
  providers: [VendorUserService],
  exports: [VendorUserService],
})
export class VendorUserModule {}
