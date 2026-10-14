import {
  Controller,
  Logger,
  Get,
  Param,
  Query,
  Post,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Trip } from '../models/trip.model';
import { MobApiTripService } from '../services/mob-api.trip.service';
import { TripFilterInput } from '../dtos/trip-filter-input.dto';
import { ConfirmSafeHomeByPinInput } from '../dtos/mark-safehome-pin-input.dto';

@Controller('employee/trip')
@ApiTags('Mobile Trip API - Employee')
@ApiBearerAuth('access-token')
export class EmployeeMobApiTripController {
  private logger = new Logger(EmployeeMobApiTripController.name);
  constructor(private readonly mobApiTripService: MobApiTripService) {}

  @Get('active-trip')
  async getActiveTrip(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.mobApiTripService.getActiveTrip(user);
  }

  @Get('employee-trip-list')
  async getTripListForEmployee(
    @Query() tripFilterInput: TripFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return await this.mobApiTripService.getTripListForEmployee(
      tripFilterInput,
      user,
    );
  }

  @ApiBody({
    description: 'Mark employee safehome using security PIN',
    type: ConfirmSafeHomeByPinInput,
  })
  @Get('completed-trips')
  async getCompletedTrips(
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return await this.mobApiTripService.getCompletedTrips(user);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.mobApiTripService.findOne(id, user);
  }

  @Post('confirm-safe-home-pin')
  async confirmSafeHomeByPin(
    @CurrentUser() user: any,
    @Body() body: ConfirmSafeHomeByPinInput,
  ) {
    return await this.mobApiTripService.confirmSafeHomeByPin(body, user);
  }
}
