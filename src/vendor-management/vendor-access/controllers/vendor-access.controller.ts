// src/vendor-management/vendor-access/controllers/vendor-access.controller.ts
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { VendorAccessService } from '../services/vendor-access.service';
import {
  AddVendorAccessInput,
  UpdateVendorAccessInput,
} from '../dtos/vendor-access-input.dto';

@ApiTags('Vendor Access')
@ApiBearerAuth('access-token')
@Controller('vendor/access')
export class VendorAccessController {
  constructor(private readonly vendorAccessService: VendorAccessService) {}

  @Post()
  async addAccess(@CurrentUser() user: any, @Body() dto: AddVendorAccessInput) {
    return this.vendorAccessService.addAccess(
      user.vendorID,
      user.vendorUserID,
      user.id,
      dto,
    );
  }

  @Get()
  async listAccess(@CurrentUser() user: any, @Query() query: any) {
    return this.vendorAccessService.listByVendor(user.vendorID, query);
  }

  @Get(':id')
  async getAccess(@CurrentUser() user: any, @Param('id') id: string) {
    return this.vendorAccessService.getById(id, user.vendorID);
  }

  @Put(':id')
  async updateAccess(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateVendorAccessInput,
  ) {
    return this.vendorAccessService.updateAccess(
      id,
      user.vendorID,
      user.id,
      dto,
    );
  }

  @Delete(':id')
  async removeAccess(@CurrentUser() user: any, @Param('id') id: string) {
    return this.vendorAccessService.removeAccess(id, user.vendorID);
  }
}
