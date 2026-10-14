import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { User } from 'src/user/models/user.model';
import { ConfigurationMaster } from '../models/config.model';
import { ConfigurationService } from '../services/config.service';
import { EmployeeService } from 'src/employee/services/employee-service';
import { DriverMultipleConfigValuesDto } from '../dtos/get-configs-input-driver.dto';

@Controller('driver/config')
@ApiTags('Config')
@ApiBearerAuth('access-token')
export class DriverConfigController {
  constructor(
    private readonly configService: ConfigurationService,
    private readonly employeeService: EmployeeService,
  ) {}

  @Post('/get-multiple-config-values')
  // @UseGuards(PermissionGuard('Config-Create'))
  async getMultipleConfigValues(
    @Body() driverConfigDto: DriverMultipleConfigValuesDto,
    @CurrentUser() user: User,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    return this.configService.getDriverMultipleConfigValues(
      driverConfigDto,
      user,
    );
  }
}
