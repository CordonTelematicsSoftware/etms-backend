import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Put,
  Delete,
  UseInterceptors,
  // UseGuards,
  BadRequestException,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import { Op } from 'sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { TripRequestService } from '../services/trip-request.service';
import { CreateTripRequestInput } from '../dtos/create-trip-request-input.dto';
import { TripRequest } from '../models/trip-request.model';
import { TripRequestFilterInput } from '../dtos/trip-request-filter-input.dto';
import {
  EmergencyTripRequestInput,
  EmployeeEmergencyTripRequestInput,
  UpdateTripRequestInput,
  UpdateTripStatusDto,
} from '../dtos/update-trip-request-input.dto';
import { FileInterceptor } from 'node_modules/@nestjs/platform-express';
import { MarkAttendanceInput } from '../dtos/mark-attendance-input.dto';
import { ETMSFilterInput } from 'src/employee/dtos/employeetriprequest-filter-input.dto';
import { RateTripDto } from '../dtos/rate-trip.dto';
import {
  excelFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';
import { MarkDeboardInput } from '../dtos/mark-deboard-input.dto';
import { Authentication } from 'src/auth/models/authentication.model';
import { InjectModel } from '@nestjs/sequelize';
import { Cron } from '@nestjs/schedule';
// import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';

@Controller('employee/trip-request')
@ApiTags('TripRequest')
@ApiBearerAuth('access-token')
export class TripRequestController {
  private logger = new Logger(TripRequestController.name);

  constructor(
    private readonly tripRequestService: TripRequestService,
    @InjectModel(Authentication)
    private authModel: typeof Authentication,
  ) {}

  // Declared above every other route on purpose. Nest matches method + path, so
  // the @Get(':id') / @Put(':id') / @Delete(':id') wildcards below cannot shadow
  // a POST, but this stays correct if a @Post(':id') is ever added.
  @Post('export')
  async exportTripRequests(
    @Body() body: { exportType: string; exportFilters: any },
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return await this.tripRequestService.exportTripRequests(
      body?.exportFilters,
      user,
    );
  }

  @Post()
  async create(
    @Body() createTripRequestInput: CreateTripRequestInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripRequest>> {
    return this.tripRequestService.create(createTripRequestInput, user);
  }

  @Post('/new')
  async createNew(
    @Body() createTripRequestInput: CreateTripRequestInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripRequest>> {
    return this.tripRequestService.employeeTripRequestNew(
      createTripRequestInput,
      user,
    );
  }

  @Get('trip-requests-by-shifttime')
  async findAllTripRequestsByShiftTime(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('shiftTime') shiftTime?: string,
    @Query('pickDrop') pickDrop?: boolean,
    @Query('requestType') requestType?: string,
  ) {
    return await this.tripRequestService.findAllTripRequestsByShiftTime(
      user,
      date,
      shiftTime,
      pickDrop,
      requestType,
    );
  }

  @Get('shiftData')
  async getShiftTimesData(
    @Query() etmsFilterInput: ETMSFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    return this.tripRequestService.getShiftTimesData(etmsFilterInput, user);
  }

  @Get('shift-time-by-trip-requests')
  async findAllShiftTimeByTrips(
    @CurrentUser() user: any,
    @Query('date') date?: string,
  ) {
    return await this.tripRequestService.findAllShiftTimeByTrips(user, date);
  }

  @Get('vendor-shift-time-by-trip-requests')
  async findAllVendorShiftTimeByTrips(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('orgID') orgID?: string,
  ) {
    return await this.tripRequestService.findAllVendorShiftTimeByTrips(
      user,
      date,
      orgID,
    );
  }

  @Get('trips-requests-for-edit')
  async findAllTripRequestsForEdit(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('shiftTime') shiftTime?: string,
    @Query('pickDrop') pickDrop?: boolean,
  ) {
    return {
      ...(await this.tripRequestService.findAllTripRequestsForEdit(
        user,
        date,
        shiftTime,
        pickDrop,
      )),
    };
  }

  @Get()
  async findAll(
    @Query() tripRequestFilterInput: TripRequestFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return {
      ...(await this.tripRequestService.findAll(tripRequestFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Trip Requests',
      ),
    };
  }

  @Put('/mark-employee-deboard')
  @ApiBody({
    description: 'Mark employee deboard',
    type: MarkDeboardInput,
  })
  async markEmployeeDeboard(
    @CurrentUser() user: any,
    @Body() markDeboardInput: MarkDeboardInput,
  ): Promise<GenericResponse<TripRequest>> {
    return await this.tripRequestService.markDeboard(markDeboardInput, user);
  }

  @Put('/cancel-ongoing/:id')
  @ApiOperation({
    summary: 'Cancel a trip request while its trip is Ongoing',
    description:
      'Allows an employee to cancel their own pickup/drop request after the trip has already started. ' +
      'Requires the TripRequest ID (from the trip request list), not the Trip ID. ' +
      'Only works if the trip is currently Ongoing and the employee has not yet boarded (attendance not marked). ' +
      'Sets the TripRequest status to "Employee-Cancelled" without removing the employee from the trip or recalculating the route.',
  })
  @ApiParam({
    name: 'id',
    description:
      "The TripRequest ID (NOT the Trip ID). This is the individual trip request record for the specific employee and pickDrop leg, obtained from the employee's trip request list.",
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Trip request cancelled successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Organization does not have this feature enabled.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Trip is not Ongoing, employee has already boarded, or trip request is already cancelled.',
  })
  @ApiResponse({
    status: 404,
    description: 'Trip request not found for this employee, or trip not found.',
  })
  async cancelOngoingTripRequest(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.tripRequestService.cancelOngoingTripRequest(id, user);
  }

  @Put('/mark-attendance')
  @ApiBody({
    description: 'Mark employee attendance',
    type: MarkAttendanceInput,
  })
  async markAttendance(
    @CurrentUser() user: any,
    @Body() markAttendanceInput: MarkAttendanceInput,
  ): Promise<GenericResponse<TripRequest>> {
    return await this.tripRequestService.markAttendance(
      markAttendanceInput,
      user,
    );
  }

  @Get('get-team-trip-requests')
  async findAllBasedOnReportingManager(
    @Query() tripRequestFilterInput: TripRequestFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<TripRequest>> {
    return {
      ...(await this.tripRequestService.findAll(tripRequestFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Team Trip Requests',
      ),
    };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripRequest>> {
    return {
      ...(await this.tripRequestService.findOne(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Trip Requests',
      ),
    };
  }

  @Put('/update-tripId')
  async updateTripID(
    @Body() data: { ids: string[] },
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripRequest[]>> {
    return await this.tripRequestService.updateTripID(data.ids, user);
  }

  @Put('/emergency-trip-update')
  async emergencyTripUpdate(
    @CurrentUser() user: any,
    @Body() updateTripRequestInput: EmergencyTripRequestInput,
  ): Promise<GenericResponse<TripRequest>> {
    return await this.tripRequestService.emergencyTripUpdate(
      updateTripRequestInput,
      user,
    );
  }

  @Put('/employee-emergency-trip-update')
  async employeeEmergencyTripUpdate(
    @CurrentUser() user: any,
    @Body() updateTripRequestInput: EmployeeEmergencyTripRequestInput,
  ): Promise<GenericResponse<TripRequest>> {
    return await this.tripRequestService.employeeEmergencyTripRequestUpdate(
      updateTripRequestInput,
      user,
    );
  }

  @Put('/admin-emergency-trip-update')
  async adminEmergencyTripUpdate(
    @CurrentUser() user: any,
    @Body() updateTripRequestInput: UpdateTripRequestInput,
  ): Promise<GenericResponse<TripRequest>> {
    return await this.tripRequestService.adminEmergencyTripRequestUpdate(
      updateTripRequestInput,
      user,
    );
  }

  @Put('/rate-trip')
  async rateTrip(
    @Body() tripInput: RateTripDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripRequest>> {
    return {
      ...(await this.tripRequestService.rateTrip(tripInput, user)),
    };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateTripRequestInput: UpdateTripRequestInput,
  ): Promise<GenericResponse<TripRequest>> {
    return await this.tripRequestService.update(
      id,
      updateTripRequestInput,
      user,
    );
  }

  @Post('/update-status')
  async updateTripStatus(
    @Body() updateTripStatusDto: UpdateTripStatusDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripRequest[]>> {
    const { ids, status } = updateTripStatusDto;
    return await this.tripRequestService.updateStatus(ids, status, user);
  }

  @Post('batch-trip-request-edit')
  async editBatchTripRequest(
    @Body() editTripRequestInput: CreateTripRequestInput, // same shape: selectedDates, loginTime, logoutTime, employeeCodes, status, locationType
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripRequest>> {
    return this.tripRequestService.editBatchTripRequest(
      editTripRequestInput,
      user,
    );
  }

  @Delete(':id')
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.tripRequestService.softDelete(id, user);
  }

  @Delete('delete/:id')
  async cancelTripRequest(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.tripRequestService.softDeleteTripRequest(id, user);
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: excelFileFilter,
      // limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importTripRequests(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<object> {
    if (!file) {
      throw new BadRequestException('File is required.');
    }
    validateUploadedFile(file, 'excel');
    this.logger.log('file---', file);
    return this.tripRequestService.importTripRequests(file.buffer, user);
  }

  @Get('get/future-trip-requests')
  async getFutureTripRequests(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('tripRequestStatus') tripRequestStatus?: string | string[],
    @Query('tripStatus') tripStatus?: string | string[],
  ): Promise<PaginatedList<TripRequest>> {
    return {
      ...(await this.tripRequestService.findAllFutureTripRequests(
        user,
        page,
        limit,
        tripRequestStatus,
        tripStatus,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Trip Requests',
      ),
    };
  }

  @Get('get/past-trip-requests')
  async getPastTripRequests(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('tripRequestStatus') tripRequestStatus?: string | string[],
    @Query('tripStatus') tripStatus?: string | string[],
  ): Promise<PaginatedList<TripRequest>> {
    return {
      ...(await this.tripRequestService.findAllPastTripRequests(
        user,
        page,
        limit,
        tripRequestStatus,
        tripStatus,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Trip Requests',
      ),
    };
  }

  @Post('batch-trip-request')
  async createBatchTripRequest(
    @Body() createTripRequestInput: CreateTripRequestInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripRequest>> {
    return this.tripRequestService.createBatchTripRequest(
      createTripRequestInput,
      user,
    );
  }

  @Post('batch-trip-request-new')
  async createBatchTripRequestNew(
    @Body() createTripRequestInput: CreateTripRequestInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripRequest>> {
    return this.tripRequestService.createBatchTripRequestNew(
      createTripRequestInput,
      user,
    );
  }

  @Get('get/count-by-shift-time')
  async getTripRequestCountsByShiftTime(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.tripRequestService.getTripRequestCountsByShiftTime(
      user,
      startDate,
      endDate,
    );
  }

  @Get('org-group/guest-employee-check')
  async guestEmployeeCheck(
    @CurrentUser() user: any,
    @Query('selectedOrgID') selectedOrgID: any,
  ) {
    return this.tripRequestService.guestEmployeeCheck(user, selectedOrgID);
  }

  @Cron('0 0 1 * *') // midnight on the 1st of every month
  // @Cron('39 15 12 8 *')
  async resetMonthlyNoShowCounters(): Promise<void> {
    this.logger.log('----- Running Noshow Cron----');
    // console.log("resetMonthlyNoShowCounters");
    await this.authModel.update(
      { noShowCount: 0 },
      { where: { noShowCount: { [Op.gt]: 0 } } },
    );
    // console.log("data:::",data);
  }
}
