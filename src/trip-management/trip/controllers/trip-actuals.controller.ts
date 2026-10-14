import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { TripActualsService } from '../services/trip-actuals.service';
import { TripActualsDto } from '../dtos/trip-actuals.dto';
import { TripActual } from '../models/trip-actual.model';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('admin/trip-actuals')
@ApiTags('Trip Actuals')
@ApiBearerAuth('access-token')
export class TripActualController {
  private logger = new Logger(TripActualController.name);
  constructor(private readonly tripActualsService: TripActualsService) {}

  @Post()
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async create(
    @Body() tripActualsDto: TripActualsDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripActual>> {
    return this.tripActualsService.saveTripActuals(tripActualsDto, user);
  }

  @Get('get-trip-actual-by-id/:id')
  //   @UseGuards(PermissionGuard('Trip-Read'))
  async findOne(@Param('id') id: string): Promise<TripActual> {
    return await this.tripActualsService.findTripActualDataWithTripID(id);
  }
}
