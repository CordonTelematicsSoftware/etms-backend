import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleService } from '../service/role.service';
import { RoleInputDto } from '../dtos/role-input.dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Role } from '../models/role.model';
import { PermissionGuard } from '../../auth/decorators/permissions.decorator';
import { RoleFilterInput } from '../dtos/role-filter-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('admin/roles')
@ApiTags('Roles')
@ApiBearerAuth('access-token')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @UseGuards(PermissionGuard('Roles-Create'))
  async create(
    @Body() createRoleInput: RoleInputDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Role>> {
    return this.roleService.createRole(createRoleInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Roles-Read'))
  async findAll(
    @Query() roleFilterInput: RoleFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Role>> {
    return {
      ...(await this.roleService.getRoles(roleFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Roles',
      ),
    };
  }
  @Get('permissions')
  async getUserData(@CurrentUser() user: any): Promise<GenericResponse<any>> {
    return {
      data: {
        userType: user?.userType,
        permissions: user?.permissions,
      },
      message: 'UserData Found',
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Roles-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Role>> {
    return {
      ...(await this.roleService.getRoleById(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Roles',
      ),
    };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard('Roles-Update'))
  async update(
    @Param('id') id: string,
    @Body() updateCityInput: RoleInputDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Role>> {
    return this.roleService.updateRole(id, updateCityInput, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Roles-Delete'))
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.roleService.deleteRole(id, user);
  }

  @Get('/checkLogin')
  @UseGuards(PermissionGuard('Roles-Read'))
  async checkLogin(): Promise<boolean> {
    return this.roleService.checkLogin();
  }
}
