import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { VendorUserService } from '../services/vendor-user.service';
import { UpdateVendorUserInput } from '../dtos/update-vendor-user-input.dto';
import { CreateVendorUserInput } from '../dtos/create-vendor-user-input.dto';
import { VendorUser } from '../models/vendor-user.model';
import { VendorUserFilterInput } from '../dtos/vendor-user-filter-input.dto';

@Controller('admin/vendor-user')
@ApiTags('VendorUser')
@ApiBearerAuth('access-token')
export class VendorUserController {
  constructor(private readonly vendorUserService: VendorUserService) {}

  @Post()
  @UseGuards(PermissionGuard('Vendor User-Create'))
  async create(
    @Body() createVendorUserInput: CreateVendorUserInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorUser>> {
    return this.vendorUserService.create(createVendorUserInput, user);
  }

  @Post('/vendor-organization-switch')
  @UseGuards(PermissionGuard('Organization-Read'))
  async vendorSwitchingOrg(
    @Body('orgID') orgID: string,
    @CurrentUser() user: any,
    @Headers('authorization') authorization: string,
  ): Promise<GenericResponse<null>> {
    if (!authorization) {
      throw new Error('Authorization header is missing');
    }
    const token = authorization.split(' ')[1];
    if (!token) {
      throw new Error('Invalid Authorization token');
    }
    return this.vendorUserService.vendorSwitchingOrg(orgID, user, token);
  }

  @Get()
  @UseGuards(PermissionGuard('Vendor User-Read'))
  async findAll(
    @Query() vendorUserFilterInput: VendorUserFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<VendorUser>> {
    return {
      ...(await this.vendorUserService.findAll(vendorUserFilterInput)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Vendor User',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Vendor User-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorUser>> {
    const result = await this.vendorUserService.findOne(id);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['image']),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Vendor User',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Vendor User-Update'))
  async update(
    @Param('id') id: string,
    @Body() updateVendorUserInput: UpdateVendorUserInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorUser>> {
    return this.vendorUserService.update(id, updateVendorUserInput, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Vendor User-Delete'))
  async softDelete(@Param('id') id: string): Promise<GenericResponse<null>> {
    return this.vendorUserService.delete(id);
  }
}
