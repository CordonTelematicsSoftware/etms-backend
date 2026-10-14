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
  UseGuards,
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
import { GrievanceService } from '../services/grievance.service';
import { FilterGrievanceInput } from '../dtos/filter-grivance-input.dto';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { GrievanceStatusChangeInput } from '../dtos/grivance-statusChange-input.dto';
import { UpdateGrievanceInput } from '../dtos/update-grievance-input.dto';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('admin/grievance')
@ApiTags('Grievance')
@ApiBearerAuth('access-token')
export class GrievanceController {
  private logger = new Logger(GrievanceController.name);
  constructor(private readonly grievanceService: GrievanceService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('attachments'))
  async create(
    @Body() creategrievanceInput: CreateGrievanceInput,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() currentUser: any,
  ): Promise<GenericResponse<Grievance>> {
    // this.logger.log('currentUser:', JSON.stringify(currentUser));
    return this.grievanceService.create(
      creategrievanceInput,
      files,
      currentUser,
    );
  }

  @Post('export')
  @UseGuards(PermissionGuard('Grievance-Read'))
  async exportGrievance(
    @Body() body: { exportType: string; exportFilters: any },
    @CurrentUser() currentUser: any,
  ): Promise<PaginatedList<Grievance>> {
    return this.grievanceService.exportGrievances(
      body?.exportFilters,
      currentUser,
    );
  }

  @Get()
  @UseGuards(PermissionGuard('Grievance-Read'))
  async findAll(
    @Query() filterGrievanceInput: FilterGrievanceInput,
    @CurrentUser() currentUser: any,
  ): Promise<PaginatedList<Grievance>> {
    const result = await this.grievanceService.findAll(
      filterGrievanceInput,
      currentUser,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['attachments']),
    };
  }

  @Put(':id')
  @UseInterceptors(FilesInterceptor('attachments'))
  async updateGrievance(
    @Param('id') id: string,
    @Body() updateGrievanceInput: UpdateGrievanceInput,
    @Body('existingAttachments') existingAttachments: string | string[],
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() currentUser: any,
  ) {
    const parsedExisting = Array.isArray(existingAttachments)
      ? existingAttachments
      : existingAttachments
      ? [existingAttachments]
      : [];

    return this.grievanceService.update(
      id,
      updateGrievanceInput,
      files,
      currentUser,
      parsedExisting,
    );
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Grievance-Read'))
  async findOne(@Param('id') id: bigint): Promise<GenericResponse<Grievance>> {
    const result = await this.grievanceService.findOne(id);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['attachments']),
    };
  }

  @Put('statusChange/:id')
  async statusChange(
    @Param('id') id: string,

    @Body() grievanceStatusChangeInput: GrievanceStatusChangeInput,
    @CurrentUser() currentUser: any,
  ): Promise<GenericResponse<Grievance>> {
    return this.grievanceService.statusChange(
      id,
      grievanceStatusChangeInput,
      currentUser,
    );
  }
}
