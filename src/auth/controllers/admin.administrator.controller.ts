import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AuthenticationUserInput } from '../dtos/authentication-input.dto';
import { Authentication } from '../models/authentication.model';
import { UpdateAuthenticationInput } from '../dtos/update-authentication-input.dto';
import { AdminService } from '../services/admin.service';
import { AdminUserFilterInput } from '../dtos/admin-user-filter-input.dto';
import { UserType } from 'src/shared/enums';

@Controller('admin/adminuser')
@ApiTags('AdminUser')
@ApiBearerAuth('access-token')
export class AdminUserController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @UseGuards(PermissionGuard('Administrators-Create'))
  async create(
    @Body() createAdminInput: AuthenticationUserInput,
  ): Promise<GenericResponse<Authentication>> {
    createAdminInput.userType = UserType.SuperAdmin;
    return this.adminService.create(createAdminInput);
  }

  @Get()
  @UseGuards(PermissionGuard('Administrators-Read'))
  async findAll(
    @Query() adminUserFilterInput: AdminUserFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Authentication>> {
    return {
      ...(await this.adminService.findAll(adminUserFilterInput)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Administrators',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Administrators-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Authentication>> {
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
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    updateAdministratorInput: UpdateAuthenticationInput,
  ): Promise<GenericResponse<Authentication>> {
    return this.adminService.update(id, updateAdministratorInput);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Administrators-Delete'))
  async softDelete(@Param('id') id: string): Promise<GenericResponse<null>> {
    return this.adminService.softDelete(id);
  }
}
