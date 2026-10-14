import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { VendorRole } from './models/vendor-role.model';
import { VendorRoleService } from './services/vendor-role.service';
import { VendorRoleController } from './controllers/vendor-role.controller';
import { Vendor } from '../vendor/models/vendor.model';
import { VendorAccess } from '../vendor-access/models/vendor-access.model';
@Module({
  imports: [SequelizeModule.forFeature([VendorRole, Vendor, VendorAccess])],
  controllers: [VendorRoleController],
  providers: [VendorRoleService],
  exports: [VendorRoleService],
})
export class VendorRoleModule {}
