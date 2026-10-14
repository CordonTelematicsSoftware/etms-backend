import {
  Controller,
  Get,
  Query,
  Logger,
  Body,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from 'node_modules/@nestjs/swagger';
import { SpocTripService } from '../services/spoc.trip.services';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Trip } from '../models/trip.model';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { UpdateTripInput } from '../dtos/update-trip-input.dto';

@Controller('spoc/trip')
@ApiTags('Trip')
@ApiBearerAuth('access-token')
export class SpocTripController {
  private logger = new Logger(SpocTripController.name);
  constructor(private readonly spocTripService: SpocTripService) {}

  @Get('trips-by-date')
  @UseGuards(PermissionGuard('Trip Spoc-Read'))
  async findAllTripsByDate(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Query('pickDrop') pickDrop: boolean,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.spocTripService.findAllTripsByDate(
        shiftTime,
        date,
        user,
        pickDrop,
      )),
    };
  }

  @Put('update-spoc-to-trip')
  @ApiBody({
    description: 'Trip array to update',
    type: UpdateTripInput,
  })
  @UseGuards(PermissionGuard('Trip Spoc-Update'))
  async updateEmployeeTrip(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Body() updateTripInput: any,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.spocTripService.updateSpocToTrip(updateTripInput, user);
  }
}
