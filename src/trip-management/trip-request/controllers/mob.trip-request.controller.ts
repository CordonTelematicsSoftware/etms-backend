import { Controller, Logger, Put, Body, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

import { MobTripRequestService } from '../services/mob.trip-request.service';
import { TripRequest } from '../models/trip-request.model';
import { MarkAttendanceViaQRInput } from '../dtos/mark-attendance-qr-input.dto';
import { MarkAttendanceViaBluetoothInput } from '../dtos/mark-attendence-bluetooth-input.dto';

@Controller('mob/trip-request')
@ApiTags('Mobile Trip Request API')
@ApiBearerAuth('access-token')
export class MobTripRequestController {
  private logger = new Logger(MobTripRequestController.name);
  constructor(private readonly mobTripRequestService: MobTripRequestService) {}

  @Put('/emergency-trip-update')
  async emergencyTripUpdate(
    @Body() emergencyUpdateInput: any,
    @CurrentUser() user: any,
  ): Promise<any> {
    return await this.mobTripRequestService.emergencyTripUpdate(
      emergencyUpdateInput,
      user,
    );
  }

  @Get()
  //    @UseGuards(PermissionGuard('Trip Requests-Read'))
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedList<TripRequest>> {
    return {
      ...(await this.mobTripRequestService.findAll(user, page, limit)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Trip Requests',
      ),
    };
  }

  @Put('/mark-attendance/qr')
  async markAttendanceByQr(
    @Body() qrDataInput: MarkAttendanceViaQRInput,
    @CurrentUser() user: any,
  ) {
    return this.mobTripRequestService.markAttendanceByQr(qrDataInput, user);
  }

  @Put('/mark-attendance/bluetooth')
  @ApiBody({
    description: 'Mark employee attendance using Bluetooth proximity',
    type: MarkAttendanceViaBluetoothInput,
  })
  async markAttendanceByBluetooth(
    @Body() bluetoothDataInput: MarkAttendanceViaBluetoothInput,
    @CurrentUser() user: any,
  ) {
    return this.mobTripRequestService.markAttendanceByBluetooth(
      bluetoothDataInput,
      user,
    );
  }
}
