import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { VendorRequest } from './models/vendor-request.model';
import { VendorRequestController } from './controllers/vendor-request.controller';
import { VendorRequestService } from './services/vendor-request.service';
import { VendorAccess } from '../vendor-access/models/vendor-access.model';
@Module({
  imports: [SequelizeModule.forFeature([VendorRequest, VendorAccess])],
  controllers: [VendorRequestController],
  providers: [VendorRequestService],
  exports: [VendorRequestService],
})
export class VendorRequestModule {}
