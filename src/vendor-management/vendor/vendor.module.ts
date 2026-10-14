import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Vendor } from './models/vendor.model';
import { VendorRole } from '../vendor-role/models/vendor-role.model';
import { VendorService } from './services/vendor.service';
import { VendorController } from './controllers/vendor.controller';
import { VendorUserModule } from '../vendor-user/vendor-user.module';
import { UploadModule } from 'src/upload/upload.module';
import { ConfigModule } from 'node_modules/@nestjs/config';
import { Authentication } from 'src/auth/models/authentication.model';
import { VendorUser } from '../vendor-user/models/vendor-user.model';
import { AuthModule } from 'src/auth/auth.module';
@Module({
  imports: [
    SequelizeModule.forFeature([
      Vendor,
      VendorRole,
      Authentication,
      VendorUser,
    ]),
    forwardRef(() => VendorUserModule),
    UploadModule,
    forwardRef(() => ConfigModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [VendorController],
  providers: [VendorService],
  exports: [VendorService],
})
export class VendorModule {}
