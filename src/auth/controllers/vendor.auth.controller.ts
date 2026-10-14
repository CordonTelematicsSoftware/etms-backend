import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { LoginInput } from '../dtos/login-input.dto';

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
import { RateLimit } from '../guards/rate-limit.decorator';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { verifyRecaptcha } from 'src/shared/utils/recaptcha.util';

@ApiTags('Auth')
@Controller('vendor')
export class VendorAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  @Public()
  async vendorLogin(
    @Body() loginInput: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GenericResponse<User>> {
    return this.authService.vendorLogin(loginInput, res);
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
  async vendorForgotPassword(
    @Body() forgotPasswordInput: ForgotPasswordInput,
  ): Promise<GenericResponse<null>> {
    await verifyRecaptcha(forgotPasswordInput.recaptchaToken); // added captchaToken verification
    return this.authService.forgotPassword(
      forgotPasswordInput.email,
      UserType.Vendor,
      EndPoint.Vendor,
    );
  }

  @Public()
  @Post('reset-password')
  async resetVendorPassword(
    @Req() req: Request,
    @Body() resetPasswordInput: ResetPasswordInput,
  ): Promise<GenericResponse<null>> {
    const {
      headers: { authorization },
    } = req;
    return this.authService.resetVendorPassword(
      authorization?.split(' ')?.[1],
      resetPasswordInput.password,
    );
  }

  @ApiBearerAuth('access-token')
  @Post('/logout')
  async logout(@CurrentUser() user: any): Promise<GenericResponse<User>> {
    return this.authService.logout(user?.id);
  }
}
