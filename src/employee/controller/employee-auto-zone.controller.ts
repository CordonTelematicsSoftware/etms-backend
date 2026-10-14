import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { EmployeeAutoZoneService } from '../services/employee-auto-zone.service';

@Controller('employee/auto-zone-assign')
@ApiTags('Employee Auto Zone Assign')
@ApiBearerAuth('access-token')
export class EmployeeAutoZoneController {
  logger: any;
  constructor(
    private readonly employeeAutoZoneService: EmployeeAutoZoneService,
  ) {}

  @Post()
  async EmployeeAutoZoneAssign(@CurrentUser() user: any): Promise<object> {
    return this.employeeAutoZoneService.EmployeeAutoZoneAssign(user);
  }
}
