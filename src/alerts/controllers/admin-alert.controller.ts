// admin-alert.controller.ts
import {
  //   Body,
  Controller,
  Get,
  //   Post,
  Query,
  Logger,
  Param,
  Put,
  Body,
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
// import { AlertCreateFilterInput } from '../dtos/create-alert-input.dto';
import { Alert } from '../models/alert.model';
import { AlertService } from '../services/alert.service';

@Controller('admin/alert')
@ApiTags('Admin Alert API')
@ApiBearerAuth('access-token')
export class AdminAlertController {
  private logger = new Logger(AdminAlertController.name);
  constructor(private readonly alertService: AlertService) {}

  //   @Post()
  //   @ApiOperation({ summary: 'Create a new alert (Admin)' })
  //   @ApiResponse({ status: 201, description: 'Alert created successfully' })
  //   @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  //   @ApiResponse({ status: 403, description: 'Forbidden - user not part of trip' })
  //   @ApiResponse({ status: 404, description: 'Trip not found' })
  //   async create(
  //     @Body() createAlertInput: AlertCreateFilterInput,
  //     @CurrentUser() user: any,
  //   ): Promise<GenericResponse<Alert>> {
  //     this.logger.log(`Admin creating alert for trip: ${createAlertInput.tripID}`);
  //     return this.alertService.createAdminAlert(createAlertInput, user);
  //   }

  @Get()
  @ApiOperation({ summary: 'Get all alerts for organization (Admin)' })
  @ApiResponse({ status: 200, description: 'Alerts retrieved successfully' })
  async findAll(
    @CurrentUser() user: any,
    @Query() filterInput?: AlertFilterInput,
  ): Promise<PaginatedList<Alert>> {
    this.logger.log(`Admin fetching alerts for org: ${user?.orgID}`);
    return {
      ...(await this.alertService.findAllAdminAlerts(user, filterInput)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Alerts',
      ),
    };
  }

  @Get('cordon-panic')
  @ApiOperation({
    summary: 'Get Cordon GPS panic events for the last 7 days (Admin)',
  })
  @ApiResponse({
    status: 200,
    description: 'Cordon panic alerts retrieved successfully',
  })
  async findCordonPanicAlerts(
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    this.logger.log(
      `Admin fetching Cordon panic alerts for org: ${user?.orgID}`,
    );
    return {
      ...(await this.alertService.findCordonPanicAlerts(user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Alerts',
      ),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get alert by ID (Admin)' })
  @ApiResponse({ status: 200, description: 'Alert retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Alert>> {
    this.logger.log(`Admin fetching alert: ${id}`);
    return this.alertService.findOne(id, user);
  }

  @Put('update-status/:id')
  async update(
    @Param('id') id: string,
    @Body() updateStatusInput: any,
  ): Promise<GenericResponse<Alert>> {
    return this.alertService.statusUpdate(id, updateStatusInput);
  }
}
