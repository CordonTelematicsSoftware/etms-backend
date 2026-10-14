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
  Logger,
  UploadedFiles,
  Res,
} from '@nestjs/common';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Cab } from '../models/cab.model';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UpdateCabInput } from '../dtos/update-cab-input.dto';
import { CabService } from '../services/cab.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CreateCabInput } from '../dtos/create-cab-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CabFilterInput } from '../dtos/cab-filter-input.dto';
import {
  FileInterceptor,
  FilesInterceptor,
} from 'node_modules/@nestjs/platform-express';
import { CabDocumentUploadInput } from '../dtos/cab-document-upload.dto';
import { CabDocumentUpload } from '../models/cabDocumentUpload.model';
import { CabDocumentFilterInput } from '../dtos/cab-document-filter-input.dto';
import { CabListFilterInput } from '../dtos/cabList-filter-input.dto';
import { Response } from 'express';
import {
  documentFileFilter,
  excelFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('admin/cab')
@ApiTags('Cab')
@ApiBearerAuth('access-token')
export class CabController {
  private logger = new Logger(CabController.name);
  constructor(private readonly cabService: CabService) {}

  @Post()
  @UseGuards(PermissionGuard('Cabs-Create'))
  @UseInterceptors(
    FilesInterceptor('documents', 10, {
      fileFilter: documentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async create(
    @Body() createCabInput: CreateCabInput,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Cab>> {
    files?.forEach((f) => validateUploadedFile(f, 'document'));
    return this.cabService.create(createCabInput, files, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Cabs-Read'))
  async findAll(
    @Query() cabFilterInput: CabFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Cab>> {
    return {
      ...(await this.cabService.findAll(cabFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cabs',
      ),
    };
  }

  @Get('unassigned-unexpired-cabs')
  @UseGuards(PermissionGuard('Cabs-Read'))
  async findUnassignedUnexpiredCabs(
    @Query() cabFilterInput: CabFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Cab>> {
    return {
      ...(await this.cabService.findUnassignedUnexpiredCabs(
        cabFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cabs',
      ),
    };
  }

  @Get('cab-documents')
  @UseGuards(PermissionGuard('Cabs-Read'))
  async getCabDocuments(
    @Query() cabDocumentFilterInput: CabDocumentFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<CabDocumentUpload>> {
    const result = await this.cabService.getCabDocuments(
      cabDocumentFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['url']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cabs',
      ),
    };
  }

  @Get('qr-code/:id')
  @UseGuards(PermissionGuard('Cabs-Read'))
  async generateCabQr(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Cab>> {
    return {
      ...(await this.cabService.generateQR(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cabs',
      ),
    };
  }

  @Get('download-documents')
  @UseGuards(PermissionGuard('Cabs-Read'))
  async downloadCabDocuments(
    @Query('id') id: any,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    return this.cabService.downloadCabDocuments(id, user, res);
  }

  @Get('list')
  @UseGuards(PermissionGuard('Cabs-Read'))
  async listAllCabs(
    @Query() cabListFilterInput: CabListFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Cab>> {
    return {
      ...(await this.cabService.listAllCabs(cabListFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cabs',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Cabs-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Cab>> {
    return {
      ...(await this.cabService.findOne(id)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cabs',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Cabs-Update'))
  @UseInterceptors(
    FilesInterceptor('documents', 10, {
      fileFilter: documentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateCabInput: UpdateCabInput,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<GenericResponse<Cab>> {
    files?.forEach((f) => validateUploadedFile(f, 'document'));
    return {
      ...(await this.cabService.update(id, updateCabInput, user, files)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cabs',
      ),
    };
  }

  @Put('document-upload/:id')
  @UseGuards(PermissionGuard('Cabs-Update'))
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: documentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async documentUpload(
    @Param('id') id: string,
    @Body() cabDocumentInput: CabDocumentUploadInput,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Cab>> {
    if (!file) throw new BadRequestException('File is required.');
    validateUploadedFile(file, 'document');
    return this.cabService.documentUpload(id, cabDocumentInput, file, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Cabs-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return {
      ...(await this.cabService.softDelete(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cabs',
      ),
    };
  }

  @Get('cab/getExpiredCabs')
  @UseGuards(PermissionGuard('Cabs-Read'))
  async getExpiredCabs(@CurrentUser() user: any): Promise<PaginatedList<Cab>> {
    return {
      ...(await this.cabService.getExpiredCabs(user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cabs',
      ),
    };
  }

  @Post('cabsheet-upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: excelFileFilter,
      // limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importCabsheet(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<object> {
    if (!file) throw new BadRequestException('File is required.');
    validateUploadedFile(file, 'excel');
    this.logger.log('file---', file);
    return await this.cabService.importCabsheet(file.buffer, user);
  }
}
