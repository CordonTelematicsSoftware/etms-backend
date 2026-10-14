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
  Headers,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { OrganizationService } from '../services/organization.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CreateOrganizationInput } from '../dtos/create-organization-input.dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Organization } from '../models/organization.model';
import { OrganizationFilterInput } from '../dtos/organization-filter-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { UpdateOrganizationInput } from '../dtos/update-organization-input.dto';
import { FileInterceptor } from 'node_modules/@nestjs/platform-express';
import {
  imageFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';

@Controller('admin/organization')
@ApiTags('Organization')
@ApiBearerAuth('access-token')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  @UseGuards(PermissionGuard('Organization-Create'))
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: imageFileFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async create(
    @Body() createOrganizationInput: CreateOrganizationInput,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Organization>> {
    if (file) validateUploadedFile(file, 'image');
    return this.organizationService.create(createOrganizationInput, user, file);
  }

  @Get('org-list')
  @UseGuards(PermissionGuard('Organization-Read'))
  async orgList(
    @Query('vendorID') vendorID: string,
  ): Promise<PaginatedList<Organization>> {
    return this.organizationService.orgList(vendorID);
  }

  @Get('name')
  // @UseGuards(PermissionGuard('Notification-Settings-Update'))
  async findName(
    @Query('orgId') orgId?: string,
  ): Promise<GenericResponse<Organization>> {
    return this.organizationService.findName(orgId);
  }

  @Get('org-count')
  @UseGuards(PermissionGuard('Organization-Read'))
  async organizationCount(): Promise<PaginatedList<number>> {
    return this.organizationService.organizationCount();
  }

  @Get()
  @UseGuards(PermissionGuard('Organization-Read'))
  async findAll(
    @Query() organizationFilterInput: OrganizationFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Organization>> {
    return this.organizationService.findAll(organizationFilterInput, user);
  }

  @Post('/organization-switching')
  async organizationSwitching(
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
    return this.organizationService.organizationSwitching(orgID, user, token);
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Organization-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Organization>> {
    return {
      ...(await this.organizationService.findOne(id)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Organization',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Organization-Update'))
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: imageFileFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async update(
    @Param('id') id: string,
    @Body() updateOrganizationInput: UpdateOrganizationInput,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Organization>> {
    if (file) validateUploadedFile(file, 'image');
    return this.organizationService.update(
      id,
      updateOrganizationInput,
      user,
      file,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Organization-Delete'))
  async softDelete(@Param('id') id: string): Promise<GenericResponse<null>> {
    return this.organizationService.softDelete(id);
  }

  @Post('/superAdmin-organization-login')
  @UseGuards(PermissionGuard('Organization-Update'))
  async superAdminLoginThroughOrg(
    @Body('orgID') orgID: string,
    @CurrentUser() user: any,
    @Headers('authorization') authorization: string,
  ): Promise<GenericResponse<Organization>> {
    if (!authorization) {
      throw new Error('Authorization header is missing');
    }
    const token = authorization.split(' ')[1];
    if (!token) {
      throw new Error('Invalid Authorization token');
    }
    return this.organizationService.superAdminLoginThroughOrg(
      orgID,
      user,
      token,
    );
  }

  @Post('/superAdmin-organization-logout')
  async superAdminLogoutFromOrg(
    @CurrentUser() user: any,
    @Headers('authorization') authorization: string,
  ): Promise<GenericResponse<Organization>> {
    if (!authorization) {
      throw new Error('Authorization header is missing');
    }
    const token = authorization.split(' ')[1];
    if (!token) {
      throw new Error('Invalid Authorization token');
    }
    return this.organizationService.superAdminLogoutFromOrg(user, token);
  }
}
