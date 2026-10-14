import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  AdminOtpVerificationInput,
  LoginInput,
  OtpVerificationInput,
} from '../dtos/login-input.dto';

import { User } from 'src/user/models/user.model';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { Response, Request } from 'express';
import {
  ForgotPasswordInput,
  ResetPasswordInput,
} from '../dtos/password-input.dto';
import { EndPoint, UserType } from 'src/shared/enums';
import { DriverOtpVerificationInput } from '../dtos/driver-login-input.dto';
import { RateLimit } from '../guards/rate-limit.decorator';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { verifyRecaptcha } from 'src/shared/utils/recaptcha.util';

@ApiTags('Auth')
@Controller('admin')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  @Public()
  async login(
    @Body() loginInput: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GenericResponse<User>> {
    return this.authService.login(loginInput, res, EndPoint.Admin);
  }

  // @Post('/login/employee')
  // @Public()
  // async empLogin(
  //   @Body() loginInput: LoginInput,
  //   @Res({ passthrough: true }) res: Response,
  // ): Promise<GenericResponse<User>> {
  //   return this.authService.login(loginInput, res, UserType.Employee);
  // }

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
    await verifyRecaptcha(loginInput.recaptchaToken); // captcha verification
    return this.authService.otpLogin(loginInput, EndPoint.Admin);
  }

  /**
   * Rate limited: same config as otp-login
   */
  @Post('/otp-vendor-login')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    freeAttempts: 3,
    initialBlockMs: 1 * 60 * 1000,
    attemptsAfterBlock: 2,
    resetWindowMs: 30 * 60 * 1000,
    identifierFields: ['phone'],
  })
  async otpVendorLogin(
    @Body() loginInput: AdminOtpVerificationInput,
  ): Promise<GenericResponse<User>> {
    return this.authService.otpLogin(loginInput, EndPoint.Vendor);
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
      EndPoint.Admin,
    );
  }

  @Post('/vendor-otp-verify')
  @Public()
  async otpLoginVerifyVendor(
    @Body() otpVerificationInput: OtpVerificationInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GenericResponse<User>> {
    return this.authService.otpLoginVerify(
      otpVerificationInput,
      res,
      EndPoint.Vendor,
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
  async adminForgotPassword(
    @Body() forgotPasswordInput: ForgotPasswordInput,
  ): Promise<GenericResponse<null>> {
    await verifyRecaptcha(forgotPasswordInput.recaptchaToken); // captcha verification
    return this.authService.forgotPassword(
      forgotPasswordInput.email,
      UserType.Admin,
      EndPoint.Admin,
    );
  }

  // @Public()
  // @Post('forgot-password/employee')
  // async employeeForgotPassword(
  //   @Body() forgotPasswordInput: ForgotPasswordInput,
  // ): Promise<GenericResponse<null>> {
  //   return this.authService.forgotPassword(
  //     forgotPasswordInput.email,
  //     UserType.Employee,
  //     EndPoint.Employee,
  //   );
  // }

  // @Public()
  // @Post('forgot-password/vendor')
  // async vendorForgotPassword(
  //   @Body() forgotPasswordInput: ForgotPasswordInput,
  // ): Promise<GenericResponse<null>> {
  //   return this.authService.forgotPassword(
  //     forgotPasswordInput.email,
  //     UserType.Vendor,
  //     EndPoint.Vendor,
  //   );
  // }

  @Public() // this function is used by admin,employee and superAdmin for password reset.
  @Post('reset-password')
  async resetPassword(
    @Req() req: Request,
    @Body() resetPasswordInput: ResetPasswordInput,
  ): Promise<GenericResponse<null>> {
    const {
      headers: { authorization },
    } = req;
    return this.authService.resetUserPassword(
      authorization?.split(' ')?.[1],
      resetPasswordInput.password,
    );
  }

  // @Public()
  // @Post('reset-password/vendor')
  // async resetVendorPassword(
  //   @Req() req: Request,
  //   @Body() resetPasswordInput: ResetPasswordInput,
  // ): Promise<GenericResponse<null>> {
  //   const {
  //     headers: { authorization },
  //   } = req;
  //   return this.authService.resetVendorPassword(
  //     authorization?.split(' ')?.[1],
  //     resetPasswordInput.password,
  //   );
  // }

  // @Post('/vendorLogin')
  // @Public()
  // async vendorLogin(
  //   @Body() loginInput: LoginInput,
  //   @Res({ passthrough: true }) res: Response,
  // ): Promise<GenericResponse<User>> {
  //   return this.authService.vendorLogin(loginInput, res);
  // }
}
