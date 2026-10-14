import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
  Patch,
  Param,
} from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { User } from 'src/user/models/user.model';
import { Response } from 'express';
import { DriverAuthService } from '../services/driver.auth.service';
// import { CreateDriverInput } from 'src/drivers/dtos/create-driver-input.dto';
// import { Driver } from 'src/drivers/models/driver.model';
// import { PermissionGuard } from '../decorators/permissions.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import {
  DriverLoginInput,
  DriverOtpVerificationInput,
} from '../dtos/driver-login-input.dto';
import { OtpVerificationInput } from '../dtos/login-input.dto';
import { RateLimit } from '../guards/rate-limit.decorator';
import { RateLimitGuard } from '../guards/rate-limit.guard';

@ApiTags('Auth')
@Controller('driver')
export class DriverAuthController {
  constructor(private readonly driverAuthService: DriverAuthService) {}

  // DISABLED 2026-09-08: unauthenticated driver self-registration (audit 3.6).
  // Drivers are created only via guarded POST /admin/driver.
  // Uncomment to restore — already guarded, do not re-add @Public().
  // @Post('register')
  // @UseGuards(PermissionGuard('Drivers-Create'))
  // async register(
  //   @Body() createDriverInput: CreateDriverInput,
  //   @CurrentUser() user: any,
  // ): Promise<GenericResponse<Driver>> {
  //   return this.driverAuthService.register(createDriverInput, user);
  // }

  @Post('/login')
  @Public()
  async login(
    @Body() loginInput: DriverLoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GenericResponse<User>> {
    return this.driverAuthService.login(
      loginInput,
      res,
      // UserType.Driver
    );
  }

  /**
   * Rate limited
   */
  @Post('/otp-login')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    freeAttempts: 3,
    initialBlockMs: 1 * 60 * 1000,
    attemptsAfterBlock: 2,
    resetWindowMs: 30 * 60 * 1000,
    identifierFields: ['phone'],
  })
  async otpLogin(
    @Body() loginInput: DriverOtpVerificationInput,
  ): Promise<GenericResponse<User>> {
    return this.driverAuthService.otpLogin(loginInput);
  }

  @Post('/otp-verify')
  @Public()
  async otpLoginVerify(
    @Body() otpVerificationInput: OtpVerificationInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GenericResponse<User>> {
    return this.driverAuthService.otpLoginVerify(otpVerificationInput, res);
  }

  @Patch('/unlock/:driverID')
  async unlockDriverAccount(
    @Param('driverID') driverID: string,
  ): Promise<GenericResponse<any>> {
    return this.driverAuthService.unlockDriverAccount(driverID);
  }

  @ApiBearerAuth('access-token')
  @Post('/logout')
  async logout(@CurrentUser() user: any): Promise<GenericResponse<User>> {
    return this.driverAuthService.logout(user?.driverID, user.userType);
  }
}
