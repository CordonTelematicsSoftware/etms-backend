import { Controller, Post, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AutoRouteService } from '../services/autoroute.service';

@Controller('admin/auto-route')
@ApiTags('Auto-Route')
@ApiBearerAuth('access-token')
export class AutoRouteController {
  logger: any;
  constructor(private readonly autoRouteService: AutoRouteService) {}

  @Post('auto-trip-route')
  async EmployeeRouting(
    @Body() autoRoutingInput: any,
    @CurrentUser() user: any,
  ): Promise<object> {
    return this.autoRouteService.autoTripRouteGeneration(
      autoRoutingInput.shiftTime,
      autoRoutingInput.date,
      autoRoutingInput.pickDrop,
      autoRoutingInput.cabCountData,
      autoRoutingInput.configData,
      user,
      autoRoutingInput?.requestType,
    );
  }

  @Post('copy-trip-route')
  async copyRouteToNewtrip(
    @Body() autoRoutingInput: any,
    @CurrentUser() user: any,
  ): Promise<object> {
    return this.autoRouteService.copyRouteToNewtrip(
      autoRoutingInput.shiftTime,
      autoRoutingInput.date,
      autoRoutingInput.copyShiftTime,
      autoRoutingInput.copyDate,
      autoRoutingInput.pickDrop,
      autoRoutingInput.requestType,
      user,
    );
  }
}
