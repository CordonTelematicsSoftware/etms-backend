import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { UserService } from '../services/user.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { ForgotPasswordInput } from '../dtos/password-input.dto';
import { ResetPasswordInput } from '../dtos/password-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { UpdatePasswordInput } from '../dtos/forgot-password.input';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';

@Controller('')
@ApiTags('User')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiBearerAuth('access-token')
  @ApiExcludeEndpoint()
  @Get('admin/get-current-user')
  async getCurrentUser(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return {
      message: 'User Found',
      data: user?.member,
    };
  }

  // @ApiBearerAuth('access-token')
  @Put('admin/resetPassword')
  @UseGuards(PermissionGuard('Reset Password-Update'))
  async updatePassword(
    @CurrentUser() user: any,
    @Body() resetPasswordInput: ResetPasswordInput,
  ): Promise<GenericResponse<null>> {
    return this.userService.updatePassword(user, resetPasswordInput);
  }

  @Public()
  @Post('sendPasswordResetLink')
  async sendPasswordResetLink(
    @Body() forgotPasswordInput: ForgotPasswordInput,
  ): Promise<any> {
    return this.userService.sendPasswordResetLink(forgotPasswordInput);
  }

  @Public()
  @Post('forgotResetPassword')
  async forgotPassword(
    @Body() updatePasswordInput: UpdatePasswordInput,
  ): Promise<any> {
    return this.userService.forgotResetPassword(updatePasswordInput);
  }
}
