import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Put,
  Delete,
  UseInterceptors,
  BadRequestException,
  UploadedFile,
  UploadedFiles,
  Res,
} from '@nestjs/common';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Driver } from '../models/driver.model';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UpdateDriverInput } from '../dtos/update-driver-input.dto';
import { DriverService } from '../services/driver.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CreateDriverInput } from '../dtos/create-driver-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { DriverFilterInput } from '../dtos/driver-filter-input.dto';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from 'node_modules/@nestjs/platform-express';
import { DriverDocumentFilterInput } from '../dtos/driver-document-filter-input.dto';
import { DriverDocumentUpload } from '../models/driverDocumentUpload.model';
import { DriverDocumentUploadInput } from '../dtos/driver-document-upload.dto';
import { DriverListFilterInput } from '../dtos/driverList-filter-input.dto';
import { Response } from 'express';
import {
  driverFileFilter,
  documentFileFilter,
  excelFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('admin/driver')
@ApiTags('Driver')
@ApiBearerAuth('access-token')
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Post()
  @UseGuards(PermissionGuard('Drivers-Create'))
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'documents', maxCount: 10 },
      ],
      {
        // Global hard ceiling to prevent huge uploads / memory abuse.
        // Fine-grained per-field limits are enforced below after buffering.
        fileFilter: driverFileFilter,
        limits: { fileSize: 10 * 1024 * 1024 },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  async create(
    @Body() createDriverInput: CreateDriverInput,
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    },
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Driver>> {
    // Image validation
    files?.image?.forEach((f) => {
      // Business rule: images max 2MB
      if (f.size > 2 * 1024 * 1024) {
        throw new BadRequestException('Image must not exceed 2 MB.');
      }

      // Magic bytes validation
      validateUploadedFile(f, 'image');
    });

    // Document validation
    files?.documents?.forEach((f) => {
      // Business rule: documents max 10MB
      if (f.size > 10 * 1024 * 1024) {
        throw new BadRequestException('Document must not exceed 10 MB.');
      }

      // Magic bytes validation
      validateUploadedFile(f, 'document');
    });

    return this.driverService.create(createDriverInput, files, user);
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: excelFileFilter,
      // limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importDrivers(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<object> {
    if (!file) {
      throw new BadRequestException('File is required.');
    }
    validateUploadedFile(file, 'excel');
    return this.driverService.importDrivers(file.buffer, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Drivers-Read'))
  async findAll(
    @Query() driverFilterInput: DriverFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Driver>> {
    const result = await this.driverService.findAll(driverFilterInput, user);
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['image']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Drivers',
      ),
    };
  }

  @Get('unassigned-drivers')
  @UseGuards(PermissionGuard('Drivers-Read'))
  async findUnassignedDriversforVendor(
    @Query() driverFilterInput: DriverFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Driver>> {
    const result = await this.driverService.findAllUnassignedDrivers(
      driverFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['image']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Drivers',
      ),
    };
  }

  @Get('unassigned-unexpired-drivers')
  @UseGuards(PermissionGuard('Drivers-Read'))
  async findUnassignedUnexpiredCabs(
    @Query() driverFilterInput: DriverFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Driver>> {
    const result = await this.driverService.findUnassignedUnexpiredDrivers(
      driverFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['image']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Drivers',
      ),
    };
  }

  @Get('driver-documents')
  @UseGuards(PermissionGuard('Drivers-Read'))
  async getCabDocuments(
    @Query() driverDocumentFilterInput: DriverDocumentFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<DriverDocumentUpload>> {
    const result = await this.driverService.getDriverDocuments(
      driverDocumentFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['url']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Drivers',
      ),
    };
  }

  @Get('download-documents')
  @UseGuards(PermissionGuard('Drivers-Read'))
  async downloadDriverDocuments(
    @Query('id') id: any,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    await this.driverService.downloadDriverDocuments(id, user, res);
  }

  @Get('list')
  @UseGuards(PermissionGuard('Drivers-Read'))
  async listAllDrivers(
    @Query() driverListFilterInput: DriverListFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Driver>> {
    const result = await this.driverService.listAllDrivers(
      driverListFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['image']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Drivers',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Drivers-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Driver>> {
    const result = await this.driverService.findOne(id, user);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['image']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Drivers',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Drivers-Update'))
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'documents', maxCount: 10 },
      ],
      {
        // Global hard ceiling
        fileFilter: driverFileFilter,
        limits: { fileSize: 10 * 1024 * 1024 },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateDriverInput: UpdateDriverInput,
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    },
  ): Promise<GenericResponse<Driver>> {
    // Image validation
    files?.image?.forEach((f) => {
      if (f.size > 2 * 1024 * 1024) {
        throw new BadRequestException('Image must not exceed 2 MB.');
      }

      validateUploadedFile(f, 'image');
    });

    // Document validation
    files?.documents?.forEach((f) => {
      if (f.size > 10 * 1024 * 1024) {
        throw new BadRequestException('Document must not exceed 10 MB.');
      }

      validateUploadedFile(f, 'document');
    });

    return {
      ...(await this.driverService.update(
        id,
        updateDriverInput,
        user,
        files as any,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Drivers',
      ),
    };
  }

  @Put('document-upload/:id')
  @UseGuards(PermissionGuard('Drivers-Update'))
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: documentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async documentUpload(
    @Param('id') id: string,
    @Body() driverDocumentInput: DriverDocumentUploadInput,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Driver>> {
    if (!file) throw new BadRequestException('File is required.');
    validateUploadedFile(file, 'document');
    return this.driverService.documentUpload(
      id,
      driverDocumentInput,
      file,
      user,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Drivers-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return {
      ...(await this.driverService.softDelete(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Drivers',
      ),
    };
  }

  @Get('/driver/getExpiredDrivers')
  @UseGuards(PermissionGuard('Drivers-Read'))
  async getExpiredDrivers(
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Driver>> {
    return {
      ...(await this.driverService.getExpiredDrivers(user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Drivers',
      ),
    };
  }
}
