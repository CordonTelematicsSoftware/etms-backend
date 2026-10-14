import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { LoginInput, OtpVerificationInput } from '../dtos/login-input.dto';

import { User } from 'src/user/models/user.model';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { Response } from 'express';
import { EndPoint, UserType } from 'src/shared/enums';
import { ForgotPasswordInput } from '../dtos/password-input.dto';
import { DriverOtpVerificationInput } from '../dtos/driver-login-input.dto';
import { RateLimit } from '../guards/rate-limit.decorator';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { verifyRecaptcha } from 'src/shared/utils/recaptcha.util';

@ApiTags('Auth')
@Controller('employee')
export class EmployeeAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  @Public()
  async login(
    @Body() loginInput: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GenericResponse<User>> {
    return this.authService.login(loginInput, res, UserType.Employee);
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
    if (loginInput.recaptchaToken) {
      // only verify if token exists, token will not be there for mobile
      await verifyRecaptcha(loginInput.recaptchaToken);
    }
    return this.authService.otpLogin(loginInput, EndPoint.Employee);
  }

  @Post('/otp-verify')
  @Public()
  async otpLoginVerify(
    @Body() otpVerificationInput: OtpVerificationInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GenericResponse<User>> {
    return this.authService.otpLoginVerify(
      otpVerificationInput,
      res,
      EndPoint.Employee,
    );
  }

  @ApiBearerAuth('access-token')
  @Post('/logout')
  async logout(@CurrentUser() user: any): Promise<GenericResponse<User>> {
    return this.authService.logout(user?.id);
  }

  /**
   * Rate limited
   */
  @Public()
  @Post('forgot-password')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    freeAttempts: 3,
    initialBlockMs: 1 * 60 * 1000,
    attemptsAfterBlock: 2,
    resetWindowMs: 30 * 60 * 1000,
    identifierFields: ['email'],
  })
  async employeeForgotPassword(
    @Body() forgotPasswordInput: ForgotPasswordInput,
  ): Promise<GenericResponse<null>> {
    await verifyRecaptcha(forgotPasswordInput.recaptchaToken); // captcha verification
    return this.authService.forgotPassword(
      forgotPasswordInput.email,
      UserType.Employee,
      EndPoint.Employee,
    );
  }
}
