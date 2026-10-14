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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { VendorRequestService } from '../services/vendor-request.service';
import { VendorRequest } from '../models/vendor-request.model';
import { VendorRequestFilterInput } from '../dtos/vendor-request-filter-input.dto';
import { CreateVendorRequestInput } from '../dtos/create-vendor-request-input.dto';
import { UpdateVendorRequestInput } from '../dtos/update-vendor-request-input.dto';

@Controller('admin/vendor-org-request')
@ApiTags('VendorRequest')
@ApiBearerAuth('access-token')
export class VendorRequestController {
  constructor(private readonly vendorRequestService: VendorRequestService) {}

  @Post()
  @UseGuards(PermissionGuard('Organization Vendor Request-Create'))
  async organizationRequest(
    @Body() createVendorRequestInput: CreateVendorRequestInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorRequest>> {
    return this.vendorRequestService.organizationRequest(
      createVendorRequestInput,
      user,
    );
  }

  @Get()
  @UseGuards(PermissionGuard('Organization Vendor Request-Read'))
  async findAll(
    @Query() vendorRequestFilterInput: VendorRequestFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<VendorRequest>> {
    return {
      ...(await this.vendorRequestService.findAll(
        vendorRequestFilterInput,
        user,
      )),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) =>
          permission?.split('-')?.[0] === 'Organization Vendor Request',
      ),
    };
  }

  // @Get('vendorList-for-dashboard')
  // @UseGuards(PermissionGuard('Dashboard-Read'))
  // async findAllVendor(
  //   @Query() vendorRequestFilterInput: VendorRequestFilterInput,
  //   @CurrentUser() user: any,
  // ): Promise<PaginatedList<VendorRequest>> {
  //   return {
  //     ...(await this.vendorRequestService.findAll(
  //       vendorRequestFilterInput,
  //       user,
  //     )),
  //     entityPermissions: user?.role?.permissions?.filter(
  //       (permission) => permission?.split('-')?.[0] === 'Dashboard',
  //     ),
  //   };
  // }

  @Get('vendor-list')
  @UseGuards(PermissionGuard('Organization Vendor Request-Read'))
  async findAllVendors(
    @Query() vendorRequestFilterInput: VendorRequestFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<VendorRequest>> {
    return {
      ...(await this.vendorRequestService.findAllVendors(
        vendorRequestFilterInput,
        user,
      )),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) =>
          permission?.split('-')?.[0] === 'Organization Vendor Request',
      ),
    };
  }

  // @Get('list-by-org')
  // @UseGuards(PermissionGuard('Organization Vendor Request-Read'))
  // async findAllOrg(
  //   @Query() vendorRequestFilterInput: VendorRequestFilterInput,
  //   @Query() orgID: string,
  //   @CurrentUser() user: any,
  // ): Promise<PaginatedList<VendorRequest>> {
  //   return {
  //     ...(await this.vendorRequestService.findAllOrg(
  //       vendorRequestFilterInput,
  //       orgID,
  //       user,
  //     )),
  //     entityPermissions: user?.role?.permissions?.filter(
  //       (permission) =>
  //         permission?.split('-')?.[0] === 'Organization Vendor Request',
  //     ),
  //   };
  // }

  @Get('/vendor-org')
  // @UseGuards(PermissionGuard('Organization Vendor Request-Read'))
  async findAllApprovedOrgOfVendor(
    @Query() vendorRequestFilterInput: VendorRequestFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<VendorRequest>> {
    return {
      ...(await this.vendorRequestService.findAllApprovedOrgOfVendor(
        vendorRequestFilterInput,
        user,
      )),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) =>
          permission?.split('-')?.[0] === 'Organization Vendor Request',
      ),
    };
  }

  @Get('list-by-org')
  @UseGuards(PermissionGuard('Organization Vendor Request-Read'))
  async findOneByOrg(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorRequest>> {
    return {
      ...(await this.vendorRequestService.findOneByOrg(user.orgID, user)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) =>
          permission?.split('-')?.[0] === 'Organization Vendor Request',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Organization Vendor Request-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorRequest>> {
    return {
      ...(await this.vendorRequestService.findOne(id)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) =>
          permission?.split('-')?.[0] === 'Organization Vendor Request',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Organization Vendor Request-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateVendorRequestInput: UpdateVendorRequestInput,
  ): Promise<GenericResponse<VendorRequest>> {
    return this.vendorRequestService.update(id, updateVendorRequestInput, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Organization Vendor Request-Delete'))
  async softDelete(@Param('id') id: string): Promise<GenericResponse<null>> {
    return this.vendorRequestService.delete(id);
  }

  @Post('/vendor-request-action')
  @UseGuards(PermissionGuard('Organization Vendor Request-Update'))
  async vendorRequestApprovalByOrg(
    @Body('id') id: string,
    @Body('requestStatus') requestStatus: string,
    @Body('description') description: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorRequest>> {
    return await this.vendorRequestService.vendorRequestApprovalByOrg(
      id,
      requestStatus,
      description,
      reason,
      user,
    );
  }
}
