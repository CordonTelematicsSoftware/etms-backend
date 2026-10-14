import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Put,
  UseInterceptors,
  UploadedFiles,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { FilesInterceptor } from 'node_modules/@nestjs/platform-express';
import { CreateGrievanceInput } from '../dtos/create-grievance-input.dto';
import { Grievance } from '../models/grievance.model';
import { FilterGrievanceInput } from '../dtos/filter-grivance-input.dto';
import { EmployeeGrievanceService } from '../services/employeeGrievance.service';
import { GmsCategory } from 'src/gms-category/models/gms-category.model';
import { FilterGmsCategoryInput } from 'src/gms-category/dtos/filter-gms-category.input.dto';
import { GrievanceHistory } from '../models/grievanceHistory.model';
import { FilterGrievanceHistoryInput } from '../dtos/filter-grievanceHistory-input.dto';
import { GrievanceStatusChangeInput } from '../dtos/grivance-statusChange-input.dto';
import { UpdateGrievanceInput } from '../dtos/update-grievance-input.dto';
import {
  documentFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('employee/grievance')
@ApiTags('EmployeeGrievance')
@ApiBearerAuth('access-token')
export class EmployeeGrievanceController {
  private logger = new Logger(EmployeeGrievanceController.name);
  constructor(
    private readonly employeeGrievanceService: EmployeeGrievanceService,
  ) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      fileFilter: documentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async create(
    @Body() creategrievanceInput: CreateGrievanceInput,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() currentUser: any,
  ): Promise<GenericResponse<Grievance>> {
    files?.forEach((f) => validateUploadedFile(f, 'document'));
    // this.logger.log(JSON.stringify(currentUser));
    return this.employeeGrievanceService.create(
      creategrievanceInput,
      files,
      currentUser,
    );
  }

  @Get('findAllCategories')
  async findAllCategories(
    @Query() filterGmsCategoryInput: FilterGmsCategoryInput,
    @CurrentUser() currentUser: any,
  ): Promise<PaginatedList<GmsCategory>> {
    return await this.employeeGrievanceService.findAllCategories(
      filterGmsCategoryInput,
      currentUser,
    );
  }

  @Get()
  async findAll(
    @Query() filterGrievanceInput: FilterGrievanceInput,
  ): Promise<PaginatedList<Grievance>> {
    const result = await this.employeeGrievanceService.findAll(
      filterGrievanceInput,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['attachments']),
    };
  }

  @Put(':id')
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      fileFilter: documentFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async updateGrievance(
    @Param('id') id: string,
    @Body() updateGrievanceInput: UpdateGrievanceInput,
    @Body('existingAttachments') existingAttachments: string | string[],
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() currentUser: any,
  ) {
    files?.forEach((f) => validateUploadedFile(f, 'document'));
    const parsedExisting = Array.isArray(existingAttachments)
      ? existingAttachments
      : existingAttachments
      ? [existingAttachments]
      : [];

    return this.employeeGrievanceService.update(
      id,
      updateGrievanceInput,
      files,
      currentUser,
      parsedExisting,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: bigint): Promise<GenericResponse<Grievance>> {
    const result = await this.employeeGrievanceService.findOne(id);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['attachments']),
    };
  }

  @Get('findAllHistory/:id')
  async findAllHistory(
    @Param('id') id: bigint,
    @Query() filterGrievanceHistoryInput: FilterGrievanceHistoryInput,
  ): Promise<PaginatedList<GrievanceHistory>> {
    return await this.employeeGrievanceService.findAllHistory(
      id,
      filterGrievanceHistoryInput,
    );
  }

  @Put('statusChange/:id')
  async statusChange(
    @Param('id') id: string,

    @Body() grievanceStatusChangeInput: GrievanceStatusChangeInput,
    @CurrentUser() currentUser: any,
  ): Promise<GenericResponse<Grievance>> {
    return this.employeeGrievanceService.statusChange(
      id,
      grievanceStatusChangeInput,
      currentUser,
    );
  }
}
