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
import { ReportSchedulerService } from '../services/report-scheduler.service';
import { ReportScheduler } from '../models/report-scheduler.model';
import { CreateReportSchedulerDto } from '../dtos/create-report-scheduler-input.dto';
import { ReportSchedulerFilterInput } from '../dtos/report-scheduler-filter.dto';
import { UpdateReportSchedulerInput } from '../dtos/update-report-scheduler.dto';

@Controller('admin/report-scheduler')
@ApiTags('ReportScheduler')
@ApiBearerAuth('access-token')
export class ReportSchedulerController {
  constructor(
    private readonly reportSchedulerService: ReportSchedulerService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard('Report Scheduler-Create'))
  async create(
    @Body() reportSchedulerInput: CreateReportSchedulerDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<ReportScheduler>> {
    return this.reportSchedulerService.create(reportSchedulerInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Report Scheduler-Read'))
  async findAll(
    @Query() reportSchedulerFilterInput: ReportSchedulerFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<ReportScheduler>> {
    return {
      ...(await this.reportSchedulerService.findAll(
        reportSchedulerFilterInput,
        user,
      )),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report Scheduler',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Report Scheduler-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<ReportScheduler>> {
    return {
      ...(await this.reportSchedulerService.findOne(id, user)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report Scheduler',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Report Scheduler-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateReportSchedulerInput: UpdateReportSchedulerInput,
  ): Promise<GenericResponse<ReportScheduler>> {
    return this.reportSchedulerService.update(
      id,
      updateReportSchedulerInput,
      user,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Report Scheduler-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.reportSchedulerService.delete(id, user);
  }
}
