import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { VendorService } from '../services/vendor.service';
import { CreateVendorInput } from '../dtos/create-vendor-input.dto';
import { Vendor } from '../models/vendor.model';
import { VendorFilterInput } from '../dtos/vendor-filter-input.dto';
import { UpdateVendorInput } from '../dtos/update-vendor-input.dto';
import { FileInterceptor } from 'node_modules/@nestjs/platform-express';
import {
  imageFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('admin/vendor')
@ApiTags('Vendor')
@ApiBearerAuth('access-token')
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Post()
  @UseGuards(PermissionGuard('Vendors-Create'))
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: imageFileFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async create(
    @Body() createVendorInput: CreateVendorInput,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Vendor>> {
    if (file) validateUploadedFile(file, 'image');
    return await this.vendorService.create(createVendorInput, user, file);
  }

  @Get('vendor-list')
  @UseGuards(PermissionGuard('Vendors List-Read'))
  async vendorsList(
    @Query('orgID') orgID: string,
  ): Promise<PaginatedList<Vendor>> {
    return this.vendorService.vendorsList(orgID);
  }

  @Get('vendor-count')
  @UseGuards(PermissionGuard('Vendors List-Read'))
  async vendorsCount(): Promise<any> {
    return this.vendorService.vendorsCount();
  }

  @Get()
  @UseGuards(PermissionGuard('Vendors-Read'))
  async findAll(
    @Query() vendorFilterInput: VendorFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Vendor>> {
    return {
      ...(await this.vendorService.findAll(vendorFilterInput)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Vendors',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Vendors-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Vendor>> {
    const result = await this.vendorService.findOne(id);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['logo']),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Vendors',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Vendors-Update'))
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: imageFileFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async update(
    @Param('id') id: string,
    @Body() updateVendorInput: UpdateVendorInput,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Vendor>> {
    if (file) validateUploadedFile(file, 'image');
    return this.vendorService.update(id, updateVendorInput, user, file);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Vendors-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.vendorService.delete(id, user);
  }
}
