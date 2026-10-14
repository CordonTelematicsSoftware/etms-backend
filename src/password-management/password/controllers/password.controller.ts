import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { PasswordService } from '../services/password.service';
import { PasswordHistoryService } from 'src/password-management/password-history/services/password-history.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ValidatePasswordDto } from '../dtos/validate-password.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('admin/passwords')
@ApiTags('Password')
export class PasswordController {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly passwordHistoryService: PasswordHistoryService,
  ) {}

  @Public()
  @Post('validate-strength')
  @ApiOperation({ summary: 'Validate a user password' })
  async validatePasswordStrength(
    @Body() validatePasswordDto: ValidatePasswordDto,
  ) {
    const { password, orgID } = validatePasswordDto;
    const result = await this.passwordService.isPasswordStrong(password, orgID);

    if (!result) {
      throw new BadRequestException('Password is not strong enough.');
    }
  }

  @Public()
  @Post('validate-expiry')
  @ApiOperation({ summary: 'Validate a user password' })
  async validatePasswordExpiry(
    @Body() validatePasswordDto: ValidatePasswordDto,
  ) {
    const { employeeID, orgID } = validatePasswordDto;

    const passwordHistory = await this.passwordHistoryService.findByEmployeeId(
      employeeID,
    );

    if (
      passwordHistory.length &&
      (await this.passwordService.isPasswordExpired(
        passwordHistory[0].createdDate,
        orgID,
      ))
    ) {
      throw new BadRequestException('Password has expired.');
    } else {
      return {
        message: 'Password is valid and not expired.',
        status: 'success',
        employeeID,
        orgID,
      };
    }
  }
}
