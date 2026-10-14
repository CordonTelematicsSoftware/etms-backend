// src/vendor-management/vendor-access/vendor-access.module.ts
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { VendorAccess } from './models/vendor-access.model';
import { Authentication } from 'src/auth/models/authentication.model';
import { VendorAccessService } from './services/vendor-access.service';
import { VendorAccessController } from './controllers/vendor-access.controller';
import { AuthModule } from 'src/auth/auth.module';
import { PasswordModule } from 'src/password-management/password/password.module';
import { VendorRequest } from 'src/vendor-management/vendor-request/models/vendor-request.model';

@Module({
  imports: [
    SequelizeModule.forFeature([VendorAccess, Authentication, VendorRequest]),
    AuthModule,
    PasswordModule,
  ],
  controllers: [VendorAccessController],
  providers: [VendorAccessService],
  exports: [VendorAccessService],
})
export class VendorAccessModule {}
