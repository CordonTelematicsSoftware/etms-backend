import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LoggerService } from './logger.service';
import { Log } from 'src/logger/models/log.model';
import { LogFilterDto } from './dtos/log-filter';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';

@ApiTags('Logger')
@ApiBearerAuth('access-token')
@Controller('logger')
export class LoggerController {
  constructor(private loggerService: LoggerService) {}

  @Get()
  @UseGuards(PermissionGuard('Logger-Read'))
  async findAll(
    @Query() logFilterDto: LogFilterDto,
  ): Promise<PaginatedList<Log>> {
    return await this.loggerService.findAll(logFilterDto);
  }

  @Get('/get-current-month-logs')
  @UseGuards(PermissionGuard('Logger-Read'))
  async getCurrentMonthLogs(): Promise<any[]> {
    return await this.loggerService.getCurrentMonthLogs();
  }
}
