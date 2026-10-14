import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CreateAdminInput } from '../dtos/create-administrator-input.dto';
import { UpdateAdministratorInput } from '../dtos/update-administrator-input.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Administrator } from '../models/administrator.model';
import { AdministratorService } from '../services/administrator.service';
import { User } from 'src/user/models/user.model';
import { AdministratorFilterInput } from '../dtos/administrator-filter-input.dto';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { UpdateAdministratorPermissionsInput } from '../dtos/update-admin-permissions-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('admin/administrators')
@ApiTags('Administrator')
@ApiBearerAuth('access-token')
export class AdministratorController {
  constructor(private readonly adminService: AdministratorService) {}

  @Post()
  @UseGuards(PermissionGuard('Administrators-Create'))
  async create(
    @Body() createAdminInput: CreateAdminInput,
  ): Promise<GenericResponse<Administrator>> {
    return this.adminService.create(createAdminInput);
  }

  @Get()
  @UseGuards(PermissionGuard('Administrators-Read'))
  async findAll(
    @Query() administratorFilterInput: AdministratorFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Administrator>> {
    return {
      ...(await this.adminService.findAll(administratorFilterInput)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Administrators',
      ),
    };
  }

  //Get all permission to show sidebar menu
  //Using PermissionGuard returns forbidden result in showing blank menu
  @Get('permissions')
  async getPermissions(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<{ permissions: string[]; userType: string }>> {
    return {
      message: 'Permissions Found',
      data: { permissions: user?.permissions || [], userType: user?.userType },
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Administrators-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Administrator>> {
    return {
      ...(await this.adminService.findOne(id)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Administrators',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Administrators-Update'))
  async update(
    @Param('id') id: string,
    @Body() updateAdministratorInput: UpdateAdministratorInput,
  ): Promise<GenericResponse<User>> {
    return this.adminService.update(id, updateAdministratorInput);
  }

  @Put(':id/update-permissions')
  @UseGuards(PermissionGuard('Administrators-Permission'))
  async updatePermissions(
    @Param('id') id: string,
    @Body()
    updateAdministratorPermissionsInput: UpdateAdministratorPermissionsInput,
  ): Promise<GenericResponse<User>> {
    return this.adminService.updatePermissions(
      id,
      updateAdministratorPermissionsInput,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Administrators-Delete'))
  async softDelete(@Param('id') id: string): Promise<GenericResponse<null>> {
    return this.adminService.softDelete(id);
  }
}
