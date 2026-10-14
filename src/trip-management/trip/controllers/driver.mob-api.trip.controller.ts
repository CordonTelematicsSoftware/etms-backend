import { Controller, Logger, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Trip } from '../models/trip.model';
import { MobApiTripService } from '../services/mob-api.trip.service';

@Controller('mob-driver/trip')
@ApiTags('Mobile Trip API - Driver')
@ApiBearerAuth('access-token')
export class DriverMobApiTripController {
  private logger = new Logger(DriverMobApiTripController.name);
  constructor(private readonly mobApiTripService: MobApiTripService) {}

  @Get('driver-trips')
  async getDriverTrips(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string | string[],
    @Query('period') period?: string,
    @Query('date') date?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ): Promise<PaginatedList<Trip>> {
    return await this.mobApiTripService.getDriverTrips(
      user,
      page,
      limit,
      status,
      period,
      date,
      sortBy,
      sortOrder,
    );
  }
}
