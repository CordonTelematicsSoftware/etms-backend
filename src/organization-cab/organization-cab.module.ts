import { Module } from '@nestjs/common';
import { OrganizationCabController } from './controllers/organization-cab.controller';
import { SequelizeModule } from 'node_modules/@nestjs/sequelize';
import { OrganizationCab } from './models/organizationCab.model';
import { CabModule } from 'src/cabs/cab.module';
import { OrganizationCabService } from './services/organization-cab.service';
import { Cab } from 'src/cabs/models/cab.model';
import { Driver } from 'src/drivers/models/driver.model';
import { OrganizationDriver } from 'src/organization-driver/models/organizationDriver.model';
import { Location } from 'src/location-management/locations/models/location.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { CabOrgRequest } from 'src/approval-request/models/cab-org-approval-req.model';
import { VendorRequest } from 'src/vendor-management/vendor-request/models/vendor-request.model';
import { CordonGpsModule } from 'src/cordon-gps/cordon-gps.module';
import { Organization } from 'src/organization/models/organization.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      OrganizationCab,
      Cab,
      Driver,
      OrganizationDriver,
      Location,
      Trip,
      CabOrgRequest,
      VendorRequest,
      Organization,
    ]),
    CabModule,
    CordonGpsModule,
  ],
  controllers: [OrganizationCabController],
  providers: [OrganizationCabService],
  exports: [OrganizationCabService],
})
export class OrganizationCabModule {}
