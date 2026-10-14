import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaginatedList } from 'src/shared/interfaces/generic-response';

import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { GrievanceHistory } from '../models/grievanceHistory.model';
import { GrievanceHistoryService } from '../services/grievanceHistory.service';
import { FilterGrievanceHistoryInput } from '../dtos/filter-grievanceHistory-input.dto';

@Controller('admin/grievanceHistory')
@ApiTags('GrievanceHistory')
@ApiBearerAuth('access-token')
export class GrievanceHistoryController {
  constructor(
    private readonly grievanceHistoryService: GrievanceHistoryService,
  ) {}

  @Get(':id')
  @UseGuards(PermissionGuard('Grievance-Read'))
  async findAll(
    @Param('id') id: bigint,
    @Query() filterGrievanceHistoryInput: FilterGrievanceHistoryInput,
  ): Promise<PaginatedList<GrievanceHistory>> {
    return await this.grievanceHistoryService.findAll(
      id,
      filterGrievanceHistoryInput,
    );
  }
}
