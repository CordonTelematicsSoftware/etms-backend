// mobile-alert.controller.ts (for employee mobile app)
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
// import { Alert } from '../models/report.alert';
import { Alert } from '../models/alert.model';
import { AlertService } from '../services/alert.service';

@Controller('mob/alert')
@ApiTags('Mobile Alert API (Employee)')
@ApiBearerAuth('access-token')
export class MobAlertController {
  private logger = new Logger(MobAlertController.name);

  constructor(private readonly alertService: AlertService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new alert for trip (Employee Mobile)' })
  @ApiResponse({ status: 201, description: 'Alert created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - employee not part of trip',
  })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async create(
    @Body() createAlertInput: AlertCreateFilterInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Alert>> {
    const userType =
      user?.userType === 'driver' || user?.driverID ? 'Driver' : 'Employee';
    const userId =
      userType === 'Driver'
        ? user?.driverID || user?.id
        : user?.employeeID || user?.id;

    this.logger.log(
      `${userType} ${userId} creating alert for trip: ${createAlertInput.tripID}`,
    );
    return this.alertService.createMobileAlert(createAlertInput, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all alerts raised by current user (Employee/Driver)',
  })
  @ApiResponse({
    status: 200,
    description: 'User alerts retrieved successfully',
  })
  async findAll(
    @CurrentUser() user: any,
    @Query() filterInput?: AlertFilterInput,
  ): Promise<PaginatedList<Alert>> {
    const userType =
      user?.userType === 'driver' || user?.driverID ? 'Driver' : 'Employee';
    const userId =
      userType === 'Driver'
        ? user?.driverID || user?.id
        : user?.employeeID || user?.id;

    this.logger.log(`${userType} ${userId} fetching their alerts`);
    return {
      ...(await this.alertService.findAllMobileAlerts(user, filterInput)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Alerts',
      ),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get alert by ID (Mobile)' })
  @ApiResponse({ status: 200, description: 'Alert retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Alert>> {
    this.logger.log(`Mobile user fetching alert: ${id}`);
    return this.alertService.findOne(id, user);
  }
}
