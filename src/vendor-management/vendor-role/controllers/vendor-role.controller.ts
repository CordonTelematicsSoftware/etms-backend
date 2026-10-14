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
import { VendorRoleService } from '../services/vendor-role.service';
import { CreateVendorRoleInput } from '../dtos/create-vendor-role-input.dto';
import { VendorRole } from '../models/vendor-role.model';
import { VendorRoleFilterInput } from '../dtos/vendor-role-filter-input.dto';
import { UpdateVendorRoleInput } from '../dtos/update-vendor-role-input.dto';
import { InjectModel } from '@nestjs/sequelize';
import { VendorAccess } from 'src/vendor-management/vendor-access/models/vendor-access.model';

@Controller('admin/vendor-role')
@ApiTags('VendorRole')
@ApiBearerAuth('access-token')
export class VendorRoleController {
  constructor(
    private readonly vendorRoleService: VendorRoleService,
    @InjectModel(VendorAccess) private vendorAccessModel: typeof VendorAccess,
  ) {}

  @Get('permissions')
  async getUserData(@CurrentUser() user: any): Promise<GenericResponse<any>> {
    let isPrimaryLogin = true;
    if (user?.userType === 'Vendor') {
      const subUserAccess = await this.vendorAccessModel.findOne({
        where: { authID: user?.id, vendorID: user?.vendorID },
      });
      isPrimaryLogin = !subUserAccess;
    }

    return {
      data: {
        userType: user?.userType,
        permissions: user?.permissions,
        isPrimaryLogin,
      },
      message: 'UserData Found',
    };
  }

  @Post()
  @UseGuards(PermissionGuard('Vendor Roles-Create'))
  async create(
    @Body() createVendorRoleInput: CreateVendorRoleInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorRole>> {
    return this.vendorRoleService.create(createVendorRoleInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Vendor Roles-Read'))
  async findAll(
    @Query() vendorRoleFilterInput: VendorRoleFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<VendorRole>> {
    return {
      ...(await this.vendorRoleService.findAll(vendorRoleFilterInput, user)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Vendor Roles',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Vendor Roles-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorRole>> {
    return {
      ...(await this.vendorRoleService.findOne(id)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Vendor Roles',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Vendor Roles-Update'))
  async update(
    @Param('id') id: string,
    @Body() updateVendorRoleInput: UpdateVendorRoleInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorRole>> {
    return this.vendorRoleService.update(id, updateVendorRoleInput, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Vendor Roles-Delete'))
  async softDelete(@Param('id') id: string): Promise<GenericResponse<null>> {
    return this.vendorRoleService.delete(id);
  }
}
