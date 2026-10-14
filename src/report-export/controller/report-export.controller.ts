import {
  Body,
  //   Body,
  Controller,
  Get,
  Logger,
  //   Param,
  Post,
  Query,
  UseGuards,
  // UseGuards,
  //   Put,,
} from '@nestjs/common';
import //   GenericResponse,
//   PaginatedList,
'src/shared/interfaces/generic-response';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
// import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { TripReportExportService } from '../service/trip-report-export.service';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { TripRequestReportExportService } from '../service/trip-req-report-export.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { TripReportFilterDto } from 'src/reports/dto/trip-report-filter.dto';
import { TripReportService } from 'src/reports/services/trip-report.service';
import { TripRequestReportFilterDto } from 'src/reports/dto/trip-request-report-filter.dto';
import { Employee } from 'src/employee/models/employee.model';
import { EmployeeReportExportService } from '../service/employee-report-export.service';
import { AlertReportExportService } from '../service/alert-report-export.service';
import { Alert } from 'src/alerts/models/alert.model';
import { CancelledTripRequestFilterDto } from 'src/reports/dto/cancelled-trip-request-filter.dto';
import { VendorTripReportFilterDto } from 'src/reports/dto/vendor-trip-filter.dto';
import { NotificationLog } from 'src/notifications/models/notification-log.model';
import { SafeHomeIVRHistory } from 'src/IVR-calling/models/safeHomeIVRHistory.model';
import { SafeHomeReportService } from 'src/reports/services/safe-home-report.service';
import { SafeHomeReportExportDto } from 'src/reports/dto/safe-home-report-filter.dto';
import { DriverOverspeedReportService } from 'src/reports/services/driver-overspeed-report.service';
import { DriverOverspeedReportFilterDto } from 'src/reports/dto/driver-overspeed-report-filter.dto';
import { DriverOverspeed } from 'src/trip-management/trip/models/driver-overspeed.model';

@Controller('admin/report-export')
@ApiTags('Report Export')
@ApiBearerAuth('access-token')
export class ReportExportController {
  private logger = new Logger(ReportExportController.name);
  constructor(
    private readonly tripReportExportService: TripReportExportService,
    private readonly tripRequestReportExportService: TripRequestReportExportService,
    private readonly tripReportService: TripReportService,
    private readonly employeeReportExportService: EmployeeReportExportService,
    private readonly alertReportExportService: AlertReportExportService,
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
      ...(await this.tripReportExportService.getOTAReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('trip-requests')
  @UseGuards(PermissionGuard('Report-Read'))
  async findAllTripRequests(
    @Query() filterDto: TripRequestReportFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    //   this.logger.log(
    //     `Fetching trip request reports with filters: ${JSON.stringify(
    //       filterDto,
    //     )}`,
    //   );
    return await this.tripRequestReportExportService.findAllReports(
      filterDto,
      user,
    );
  }

  @Post('trip-requests')
  @UseGuards(PermissionGuard('Report-Read'))
  async findAllTripRequestsExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return await this.tripRequestReportExportService.findAllReports(
      exportFilters,
      user,
    );
  }

  @Get('Trip-report')
  @UseGuards(PermissionGuard('Report-Download'))
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
    // this.logger.log(
    //   `Fetching trip reports with filters: ${JSON.stringify(filterDto)}`,
    // );
    return this.tripReportService.findAllReports(filterDto, user);
  }

  @Get('Vendor-trip-report')
  @UseGuards(PermissionGuard('Report-Download'))
  @ApiOkResponse({ description: 'Returns all trips of a vendor' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({ name: 'vendorID', required: false, type: String })
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
    // this.logger.log(
    //   `Fetching trip reports with filters: ${JSON.stringify(filterDto)}`,
    // );
    return this.tripReportService.getVendorTripDetails(filterDto, user);
  }

  @Post('OTA-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getOTAReportExport(
    @Body() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripReportExportService.getOTAReport(
        reportFilterInput,
        user,
      )),
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
      ...(await this.tripReportExportService.getOTDReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('OTD-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getOTDReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripReportExportService.getOTDReport(exportFilters, user)),
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
      ...(await this.tripRequestReportExportService.getNoshowReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('noshow-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getNoShowReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return {
      ...(await this.tripRequestReportExportService.getNoshowReport(
        exportFilters,
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
      ...(await this.tripRequestReportExportService.getEmployeeNoshowReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('employe-noshow-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getEmployeeNoshowReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return {
      ...(await this.tripRequestReportExportService.getEmployeeNoshowReport(
        exportFilters,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('escort-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getEscortReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripReportExportService.getEscortReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('escort-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getEscortReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripReportExportService.getEscortReport(
        exportFilters,
        user,
      )),
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
      ...(await this.employeeReportExportService.getEmployeeAttritionReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }
  @Post('employee-attrition-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getEmployeeAttritionReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeReportExportService.getEmployeeAttritionReport(
        exportFilters,
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
    @Query() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeReportExportService.getNewEmployeeReport(
        exportFilters,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('employee-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getNewEmployeeReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeReportExportService.getNewEmployeeReport(
        exportFilters,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }
  @Get('employee-panic-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getEmployeePanicReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Alert>> {
    return {
      ...(await this.alertReportExportService.getPanicReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }
  @Post('employee-panic-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getEmployeePanicReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Alert>> {
    return {
      ...(await this.alertReportExportService.getPanicReport(
        exportFilters,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('trip-requests-cancelled')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({
    description: 'Returns cancelled trip request reports based on filters',
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
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async findAllCancelledTripRequests(
    @Query() filterDto: CancelledTripRequestFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    // this.logger.log(
    //   `Fetching cancelled trip request reports with filters: ${JSON.stringify(
    //     filterDto,
    //   )}`,
    // );
    return await this.tripRequestReportExportService.findAllCancelledReports(
      filterDto,
      user,
    );
  }

  @Post('trip-requests-cancelled')
  @UseGuards(PermissionGuard('Report-Read'))
  async findAllCancelledTripRequestsExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return await this.tripRequestReportExportService.findAllCancelledReports(
      exportFilters,
      user,
    );
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
    return await this.tripRequestReportExportService.findAllAdHocMedicalReports(
      filterDto,
      user,
    );
  }

  @Post('trip-requests-adhoc-medical')
  @UseGuards(PermissionGuard('Report-Read'))
  async ffindAllAdHocMedicalTripRequestsExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return await this.tripRequestReportExportService.findAllAdHocMedicalReports(
      exportFilters,
      user,
    );
  }

  @Get('employee-tripRate-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getTripRatingReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripRequestReportExportService.getTripRatingReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('employee-tripRate-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getTripRatingReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripRequestReportExportService.getTripRatingReport(
        exportFilters,
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
      ...(await this.tripRequestReportExportService.getCabArrivalTimeReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('cab-arrival-time-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getCabArrivalTimeReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripRequestReportExportService.getCabArrivalTimeReport(
        exportFilters,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('sms-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getSMSReport(
    @Query() reportFilterInput: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<NotificationLog>> {
    return {
      ...(await this.alertReportExportService.getSMSReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('sms-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getSMSReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<NotificationLog>> {
    return {
      ...(await this.alertReportExportService.getSMSReport(
        exportFilters,
        user,
      )),
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
      ...(await this.alertReportExportService.getIVRReport(
        reportFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('ivr-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async getIVRReportExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<SafeHomeIVRHistory>> {
    return {
      ...(await this.alertReportExportService.getIVRReport(
        exportFilters,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('safe-home-report')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({ description: 'Returns the safe-home report (export)' })
  async getSafeHomeReport(
    @Query() exportFilters: SafeHomeReportExportDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    const items = await this.safeHomeReportService.getSafeHomeReportForExport(
      exportFilters,
      user,
    );
    return {
      totalItems: items.length,
      items,
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Post('safe-home-report')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({ description: 'Returns the safe-home report (export)' })
  async getSafeHomeReportExport(
    @Body() exportFilters: SafeHomeReportExportDto,
    @CurrentUser() user: any,
  ): Promise<any> {
    const items = await this.safeHomeReportService.getSafeHomeReportForExport(
      exportFilters,
      user,
    );
    return {
      totalItems: items.length,
      items,
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report-Read',
      ),
    };
  }

  @Get('trip-report-detailed-vendor')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({
    description:
      'Returns detailed vendor trip reports (export) based on filters',
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
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async findAllReportsDetailedVendor(
    @Query() filterDto: TripReportFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return await this.tripReportExportService.findAllReportsExportDetailedVendor(
      filterDto,
      user,
    );
  }

  @Post('trip-report-detailed-vendor')
  @UseGuards(PermissionGuard('Report-Read'))
  async findAllReportsDetailedVendorExport(
    @Body() exportFilters: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return await this.tripReportExportService.findAllReportsExportDetailedVendor(
      exportFilters,
      user,
    );
  }

  @Get('overspeed-report')
  @UseGuards(PermissionGuard('Report-Read'))
  @ApiOkResponse({
    description: 'Returns driver overspeed reports (export) based on filters',
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({ name: 'driverCode', required: false, type: String })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, type: String })
  async getOverspeedReportExport(
    @Query() filterDto: DriverOverspeedReportFilterDto,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<DriverOverspeed>> {
    return this.driverOverspeedReportService.findAllReports(filterDto, user);
  }
}
