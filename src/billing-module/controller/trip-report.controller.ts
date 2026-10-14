import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { TripBillingReportService } from '../services/trip-report.service';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { TripReportInput } from '../dtos/trip-report-input.dto';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';

@Controller('billing/trip-report')
@ApiTags('Trip Billing Report')
@ApiBearerAuth('access-token')
export class TripBillingReportController {
  constructor(
    private readonly tripBillingReportService: TripBillingReportService,
  ) {}

  @Get()
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async findAll(
    @Query() tripReportInput: TripReportInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return await this.tripBillingReportService.findAll(tripReportInput, user);
  }

  @Get('trip-billing-report')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async listAll(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('vendorID') vendorID?: string,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripBillingReportService.listAll(
        user,
        startDate,
        endDate,
        vendorID,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) =>
          permission?.split('-')?.[0] === 'Trip Billing Report-Read',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async findOne(
    @Param('id') id: number,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    const trip: any = await this.tripBillingReportService.findOne(id);
    // Additive: the service returns the raw Trip, so its columns already sit
    // at the top level of the body - entityPermissions goes beside them, which
    // is where detailsView reads it. toJSON() rather than a bare spread so the
    // eager-loaded associations come through and Sequelize internals do not.
    return {
      ...(trip?.toJSON ? trip.toJSON() : trip),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Trip Billing Report',
      ),
    };
    // return {
    //   ...(await await this.tripBillingReportService.findOne(id)),
    //   entityPermissions: user?.permissions?.filter(
    //     (permission) =>
    //       permission?.split('-')?.[0] === 'Trip Billing Report',
    //   ),
    // };
  }
  @Get('/route-map-view:id')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async findOneTrip(@Param('id') id: number): Promise<GenericResponse<Trip>> {
    return await this.tripBillingReportService.findOne(id);
    // return {
    //   ...(await await this.tripBillingReportService.findOne(id)),
    //   entityPermissions: user?.permissions?.filter(
    //     (permission) =>
    //       permission?.split('-')?.[0] === 'Trip Billing Report',
    //   ),
    // };
  }
}
