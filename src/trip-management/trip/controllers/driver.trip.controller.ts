import {
  Controller,
  Get,
  Query,
  //   UseGuards,
  Logger,
  Body,
  Put,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiTags,
  ApiOperation,
} from 'node_modules/@nestjs/swagger';
import { DriverTripService } from '../services/driver.trip.services';
// import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { TripFilterInput } from '../dtos/trip-filter-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Trip } from '../models/trip.model';
import {
  DriverMarkNearbyDto,
  DriverMarkNoShowDto,
  UpdateTripInput,
  UpdateTripStatusDto,
} from '../dtos/update-trip-input.dto';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { TripService } from '../services/trip.service';
import { CompleteTripDto } from '../dtos/create-complete-trip.dto';
import { SecurityAttendance } from 'src/security/models/securityAttendance.model';
import { SecurityOtpDto } from '../dtos/spoc-trip-otp.dto';
import { SecurityAttendanceDto } from '../dtos/spock-attendance-input.dto';
import { MarkCabReachedInput } from '../dtos/mark-cab-reached-input.dto';
import {
  AddEmpByDriverInputDto,
  AddEmpByDriverOtpInputDto,
} from '../dtos/add-employee-by-driver.dto';
import { MarkAttendanceViaPinInput } from '../dtos/mark-attendance-pin-input.dto';
import { MarkDeboardViaPinInput } from '../dtos/mark-deboard-pin-input.dto';
import { DriverOverspeedInput } from '../dtos/driver-overspeed.dto';
// import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';

@Controller('driver/trip')
@ApiTags('Trip')
@ApiBearerAuth('access-token')
export class DriverTripController {
  private logger = new Logger(DriverTripController.name);
  constructor(
    private readonly driverTripService: DriverTripService,
    private readonly tripService: TripService,
  ) {}

  @Post('spock-attendance-otp')
  async createSpocAttendanceOtp(
    @Body() inputDto: SecurityOtpDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<any>> {
    return this.driverTripService.createSpocAttendanceOtp(
      inputDto.tripID,
      user,
    );
  }

  @Post('add-employee-by-driver-otp')
  async addEmployeeByDriverOtp(
    @CurrentUser() user: any,
    @Body() addEmpByDriverOtpInput: AddEmpByDriverOtpInputDto,
  ): Promise<GenericResponse<any>> {
    return await this.driverTripService.addEmployeeByDriverOtp(
      addEmpByDriverOtpInput,
      user,
    );
  }

  @Post('add-employee-by-driver-trip')
  async addEmployeeByDriverToTrip(
    @CurrentUser() user: any,
    @Body() addEmpByDriverInput: AddEmpByDriverInputDto,
  ): Promise<GenericResponse<any>> {
    return await this.driverTripService.addEmployeeByDriverToTrip(
      addEmpByDriverInput,
      user,
    );
  }

  @Post('overspeed')
  @ApiOperation({ summary: 'Log a driver overspeed event' })
  async logOverspeedEvent(
    @Body() input: DriverOverspeedInput,
    @CurrentUser() user: any,
  ) {
    return this.driverTripService.logOverspeedEvent(input, user);
  }

  @Get()
  //   @UseGuards(PermissionGuard('Driver Trip-Read'))
  async findAll(
    @Query() tripFilterInput: TripFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.driverTripService.findAllAssignedTrips(
        tripFilterInput,
        user,
      )),
    };
  }

  @Get('active-trip')
  async getActiveTrip(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.driverTripService.getActiveTrip(user);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.driverTripService.findOne(id, user);
  }

  @Put('/update-status')
  @ApiBody({
    description: 'TripID array to update',
    type: UpdateTripStatusDto,
  })
  //   @UseGuards(PermissionGuard('Driver Trip-Read'))
  async updateDriverTripStatus(
    @CurrentUser() user: any,
    @Body() updateTripStatusDto: UpdateTripStatusDto,
  ): Promise<GenericResponse<Trip[]>> {
    const { ids, status } = updateTripStatusDto;
    return await this.driverTripService.updateDriverStatus(ids, status, user);
  }

  @Put('/start-trip/:id')
  //   @UseGuards(PermissionGuard('Trip Requests-Update'))
  async startTrip(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.driverTripService.startTrip(id, user);
  }

  @Put('verify-employee-otp')
  async verifyEmployeeOtp(
    @Body() verifyEmployeeInput: any,
    @CurrentUser() user: any, // the driver making the request
  ): Promise<GenericResponse<TripRequest>> {
    return await this.driverTripService.verifyEmployeeOtp(
      verifyEmployeeInput.tripRequestID,
      verifyEmployeeInput.employeeOTP,
      verifyEmployeeInput.attendanceLocation,
      user,
    );
  }
  @Put('/mark-attendance/pin')
  @ApiBody({
    description: 'Mark employee attendance using security PIN',
    type: MarkAttendanceViaPinInput,
  })
  async markAttendanceByPin(
    @Body() pinAttendanceInput: MarkAttendanceViaPinInput,
    @CurrentUser() user: any,
  ) {
    return this.driverTripService.markAttendanceByPin(pinAttendanceInput, user);
  }

  @Put('/mark-employee-deboard/pin')
  @ApiBody({
    description: 'Mark employee deboard using security PIN',
    type: MarkDeboardViaPinInput,
  })
  async markEmployeeDeboardByPin(
    @CurrentUser() user: any,
    @Body() markDeboardPinInput: MarkDeboardViaPinInput,
  ) {
    return await this.driverTripService.markDeboardByPin(
      markDeboardPinInput,
      user,
    );
  }

  @Put('complete-trip')
  @ApiBody({
    description: 'Complete trip with trip ID',
    type: CompleteTripDto,
  })
  async completeTrip(
    @Body() tripInput: CompleteTripDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.completeTrip(tripInput, user);
  }

  @Put('autoComplete-trip')
  @ApiBody({
    description: 'AutoComplete trip with trip ID',
    type: CompleteTripDto,
  })
  async autoCompleteTrip(
    @Body() tripInput: CompleteTripDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.autoCompleteTrip(tripInput, user);
  }

  @Put('remove-employee-trip')
  @ApiBody({
    description: 'Trip array to update',
    type: UpdateTripInput,
  })
  async deleteEmployeeFromTrip(
    @CurrentUser() user: any,
    @Body() updateTripInput: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.deleteEmployeeFromTrip(updateTripInput, user);
  }

  @Put('driver/mark-no-show')
  @ApiBody({
    description: 'Mark employee as no-show for driver',
    type: DriverMarkNoShowDto,
  })
  async markEmployeeNoShowByDriver(
    @CurrentUser() user: any,
    @Body() markNoShowInput: DriverMarkNoShowDto,
  ): Promise<GenericResponse<null>> {
    return await this.tripService.markEmployeeNoShowByDriver(
      markNoShowInput,
      user,
    );
  }

  @Put('employee-nearby-location')
  @ApiBody({
    description: 'Mark employee emplyee nearby location driver',
    type: DriverMarkNearbyDto,
  })
  async markEmployeeNearByLocation(
    @CurrentUser() user: any,
    @Body() markNearbyInput: DriverMarkNearbyDto,
  ): Promise<GenericResponse<null>> {
    return await this.tripService.markEmployeeNearByLocation(
      markNearbyInput,
      user,
    );
  }

  @Put('spock-attendance')
  async updateSpockAttendance(
    @CurrentUser() user: any,
    @Body() updateSpockAttendanceDto: SecurityAttendanceDto,
  ): Promise<GenericResponse<SecurityAttendance>> {
    return await this.driverTripService.updateSpockAttendance(
      updateSpockAttendanceDto,
      user,
    );
  }

  @Put('/cab-reached')
  async markCabReached(
    @Body() cabReachedInput: MarkCabReachedInput,
    @CurrentUser() user: any,
  ) {
    return this.driverTripService.markCabReached(cabReachedInput, user);
  }
}
