// driver-alert.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Logger,
  Param,
} from '@nestjs/common';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AlertFilterInput } from '../dtos/alert-filter-input.dto';
import { AlertCreateFilterInput } from '../dtos/create-alert-input.dto';
import { Alert } from '../models/alert.model';
import { AlertService } from '../services/alert.service';

@Controller('driver/alert')
@ApiTags('Driver Alert API')
@ApiBearerAuth('access-token')
export class DriverAlertController {
  private logger = new Logger(DriverAlertController.name);

  constructor(private readonly alertService: AlertService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new alert for trip (Driver)' })
  @ApiResponse({ status: 201, description: 'Alert created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - driver not assigned to trip',
  })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async create(
    @Body() createAlertInput: AlertCreateFilterInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Alert>> {
    this.logger.log(
      `Driver ${user?.driverID || user?.id} creating alert for trip: ${
        createAlertInput.tripID
      }`,
    );
    return this.alertService.createDriverAlert(createAlertInput, user);
  }

  @Get()
  @ApiOperation({ summary: 'Get all alerts raised by driver' })
  @ApiResponse({
    status: 200,
    description: 'Driver alerts retrieved successfully',
  })
  async findAll(
    @CurrentUser() user: any,
    @Query() filterInput?: AlertFilterInput,
  ): Promise<PaginatedList<Alert>> {
    this.logger.log(
      `Driver ${user?.driverID || user?.id} fetching their alerts`,
    );
    return {
      ...(await this.alertService.findAllDriverAlerts(user, filterInput)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Alerts',
      ),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get alert by ID (Driver)' })
  @ApiResponse({ status: 200, description: 'Alert retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Alert>> {
    this.logger.log(`Driver fetching alert: ${id}`);
    return this.alertService.findOne(id, user);
  }
}
