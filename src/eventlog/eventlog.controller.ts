import { Controller, Post, Body, Get, UseGuards, Query } from '@nestjs/common';
import { EventLogService } from './eventlog.service';

// import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { CreateEventLogTypeDto } from './dto/createEventlog.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
// import { Get } from '@nestjs/common/decorators';

@Controller('eventlog')
@ApiTags('Eventlog')
@ApiBearerAuth('access-token')
export class EventLogController {
  constructor(private readonly eventlogService: EventLogService) {}

  @Post()
  createWithType(@Body() createEventLogTypeDto: CreateEventLogTypeDto) {
    return this.eventlogService.createWithType(createEventLogTypeDto);
  }

  @Post('/export')
  @UseGuards(PermissionGuard('EventLog-Read'))
  async exportEventLogs(
    @CurrentUser() user: any,
    @Body() body: { exportType: string; exportFilters: any },
  ): Promise<any> {
    const { dateRange, objectType } = body?.exportFilters || {};
    return await this.eventlogService.exportEventLogs(user, {
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
      objectType,
    });
  }

  // @UseGuards(PermissionGuard('Administrators-Read'))
  // @Get('getEventLogList')
  // getEventLogList(
  //   @Query() eventLogFilterInput: EventLogFilterInput,
  //   @CurrentUser() user: User,
  // ): Promise<EventLogListResponse> {
  //   return this.eventlogService.getEventLogList(eventLogFilterInput, user);
  // }

  @Get('/get-current-month-logs')
  @UseGuards(PermissionGuard('EventLog-Read'))
  async getCurrentMonthLogs(
    @CurrentUser() user: any,
    @Query('skip') skip: number,
    @Query('take') take: number,
    @Query('month') month: string,
    @Query('date') date?: string,
    @Query('year') year?: string,
    @Query('search') search?: string,
    @Query('objectType') objectType?: string,
  ): Promise<any> {
    return await this.eventlogService.getCurrentMonthLogs(user, {
      skip,
      take,
      month,
      date,
      year,
      search,
      objectType,
    });
  }

  @Get('/modules')
  @UseGuards(PermissionGuard('EventLog-Read'))
  async getModules(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ): Promise<any> {
    return await this.eventlogService.getModules(user, month, year);
  }

  // @Get('getMonthlySystemUsageCount/:id')
  // getMonthlySystemUsageCount(@Body('userId') userId: number) {
  //   return this.eventlogService.getMonthlySystemUsageCount(userId);
  // }

  @Get('/logs-by-range')
  @UseGuards(PermissionGuard('EventLog-Read'))
  async getLogsByRange(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('objectType') objectType?: string,
    @Query('search') search?: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ): Promise<any> {
    return await this.eventlogService.getLogsByDateRange(user, {
      startDate,
      endDate,
      objectType,
      search,
      skip: Number(skip) || 0,
      take: Number(take) || 25,
    });
  }

  @Get('/modules-by-range')
  @UseGuards(PermissionGuard('EventLog-Read'))
  async getModulesByRange(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<any> {
    return await this.eventlogService.getModulesByDateRange(
      user,
      startDate,
      endDate,
    );
  }
}
