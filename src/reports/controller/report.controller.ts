import { Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import 'src/shared/interfaces/generic-response';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { TripReportService } from '../services/trip-report.service';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { TripRequestReportService } from '../services/trip-request-report.service';
import { TripRequestReportFilterDto } from '../dto/trip-request-report-filter.dto';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { TripReportFilterDto } from '../dto/trip-report-filter.dto';
import { Employee } from 'src/employee/models/employee.model';
import { EmployeeReportService } from '../services/employee-report.service';
import { AlertReportService } from '../services/alert-report.service';
import { Alert } from 'src/alerts/models/alert.model';
import { VendorTripReportFilterDto } from '../dto/vendor-trip-filter.dto';
import { NotificationLog } from 'src/notifications/models/notification-log.model';
import { SafeHomeIVRHistory } from 'src/IVR-calling/models/safeHomeIVRHistory.model';
import { SafeHomeReportService } from '../services/safe-home-report.service';
import {
  SafeHomeFiltersDto,
  SafeHomeReportFilterDto,
} from '../dto/safe-home-report-filter.dto';
import { DriverOverspeedReportService } from '../services/driver-overspeed-report.service';
import { DriverOverspeedReportFilterDto } from '../dto/driver-overspeed-report-filter.dto';
import { DriverOverspeed } from 'src/trip-management/trip/models/driver-overspeed.model';

@Controller('admin/report')
@ApiTags('Reports')
@ApiBearerAuth('access-token')
export class ReportController {
  private logger = new Logger(ReportController.name);

  constructor(
    private readonly tripReportService: TripReportService,
    private readonly tripRequestReportService: TripRequestReportService,
    private readonly employeeReportService: EmployeeReportService,
    private readonly alertReportService: AlertReportService,
    private readonly safeHomeReportService: SafeHomeReportService,
    private readonly driverOverspeedReportService: DriverOverspeedReportService,
  ) {}

  @Get('OTA-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getOTAReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripReportService.getOTAReport(reportFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('OTD-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getOTDReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripReportService.getOTDReport(reportFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('noshow-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getNoshowReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return {
      ...(await this.tripRequestReportService.getNoshowReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('employe-noshow-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getEmployeeNoshowReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return {
      ...(await this.tripRequestReportService.getEmployeeNoshowReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('trip-report-detailed-vendor')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({
    description: 'Returns detailed vendor trip reports based on filters',
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({
    name: 'loginTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'logoutTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: [String],
    isArray: true,
    example: ['Pending', 'Confirmed', 'Completed'],
  })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async findAllReportsDetailedVendor(
    @Query() filterDto: TripReportFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    this.logger.log(
      `Fetching detailed vendor trip reports with filters: ${JSON.stringify(
        filterDto,
      )}`,
    );
    return await this.tripReportService.findAllReportsDetailedVendor(
      filterDto,
      user,
    );
  }

  @Get('overspeed-report')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({
    description: 'Returns driver overspeed reports based on filters',
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({ name: 'driverCode', required: false, type: String })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async getOverspeedReport(
    @Query() filterDto: DriverOverspeedReportFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<DriverOverspeed>> {
    return await this.driverOverspeedReportService.findAllReports(
      filterDto,
      user,
    );
  }

  @Get()
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({ description: 'Returns trip reports based on filters' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({
    name: 'loginTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'logoutTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: [String],
    isArray: true,
    example: ['Pending', 'Confirmed', 'Completed'],
  })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async findAll(
    @Query() filterDto: TripReportFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    this.logger.log(
      `Fetching trip reports with filters: ${JSON.stringify(filterDto)}`,
    );
    return await this.tripReportService.findAllReports(filterDto, user);
  }

  @Get('trip-requests')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({
    description: 'Returns trip request reports based on filters',
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({
    name: 'shiftTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: [String],
    isArray: true,
    example: ['Active', 'Inactive'],
  })
  @ApiQuery({ name: 'pickDrop', required: false, type: Boolean })
  @ApiQuery({ name: 'attendance', required: false, type: Boolean })
  @ApiQuery({ name: 'noShow', required: false, type: Boolean })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async findAllTripRequests(
    @Query() filterDto: TripRequestReportFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    this.logger.log(
      `Fetching trip request reports with filters: ${JSON.stringify(
        filterDto,
      )}`,
    );
    return await this.tripRequestReportService.findAllReports(filterDto, user);
  }

  @Get('trip-requests-adhoc-medical')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({
    description:
      'Returns AdHoc and Medical trip request reports based on filters',
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiQuery({
    name: 'loginTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'logoutTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'emergencyTypes',
    required: false,
    type: [String],
    isArray: true,
    example: ['AdHoc', 'Medical'],
  })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async findAllAdHocMedicalTripRequests(
    // @Query() filterDto: TripRequestAdHocMedicalFilterDto,
    @Query() filterDto: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    this.logger.log(
      `Fetching AdHoc/Medical trip request reports with filters: ${JSON.stringify(
        filterDto,
      )}`,
    );
    return await this.tripRequestReportService.findAllAdHocMedicalReports(
      filterDto,
      user,
    );
  }

  @Get('trip-requests-cancelled')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({
    description: 'Returns cancelled trip request reports based on filters',
  })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiQuery({
    name: 'loginTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'logoutTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async findAllCancelledTripRequests(
    // @Query() filterDto: CancelledTripRequestFilterDto,
    @Query() filterDto: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    this.logger.log(
      `Fetching cancelled trip request reports with filters: ${JSON.stringify(
        filterDto,
      )}`,
    );
    return await this.tripRequestReportService.findAllCancelledReports(
      filterDto,
      user,
    );
  }

  @Get('escort-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getEscortReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripReportService.getEscortReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('getTipShiftTimes')
  async getTipShiftTimes(@CurrentUser() user: any): Promise<any> {
    return {
      ...(await this.tripReportService.getTipShiftTimes(user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('employee-attrition-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getEmployeeAttritionReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeReportService.getEmployeeAttritionReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('employee-panic-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getPanicReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Alert>> {
    return {
      ...(await this.alertReportService.getPanicReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('employee-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getNewEmployeeReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeReportService.getNewEmployeeReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('employee-tripRate-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getTripRatingReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripRequestReportService.getTripRatingReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('cab-arrival-time-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getCabArrivalTimeReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripRequestReportService.getCabArrivalTimeReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('vendor-trip-report')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({ description: 'Returns all trips of a vendor' })
  @ApiQuery({ name: 'vendorID', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({
    name: 'loginTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'logoutTimes',
    required: false,
    type: [String],
    isArray: true,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: [String],
    isArray: true,
    example: ['Pending', 'Confirmed', 'Completed'],
  })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async findVendorReport(
    @Query() filterDto: VendorTripReportFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    this.logger.log(
      `Fetching vendor trip report with filters: ${JSON.stringify(filterDto)}`,
    );
    return await this.tripReportService.getVendorTripDetails(filterDto, user);
  }

  @Get('sms-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getSMSReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<NotificationLog>> {
    return {
      ...(await this.alertReportService.getSMSReport(reportFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('/safe-home-report')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({
    description: 'Returns the safe-home report based on filters',
  })
  // `filters` is nested, so it needs deepObject style rather than the flat
  // @ApiQuery list the other DTO-typed report routes use.
  @ApiQuery({
    name: 'filters',
    required: false,
    style: 'deepObject',
    explode: true,
    type: SafeHomeFiltersDto,
  })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  async getSafeHomeReport(
    @Query() filterDto: SafeHomeReportFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    return {
      ...(await this.safeHomeReportService.getSafeHomeReport(filterDto, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('ivr-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getIVRReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<SafeHomeIVRHistory>> {
    return {
      ...(await this.alertReportService.getIVRReport(reportFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }
}
