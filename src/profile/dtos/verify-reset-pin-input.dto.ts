import { Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPinResetOtpDto {
  @ApiProperty({ required: true })
  @Length(4, 4, {
    message: 'OTP must be 4 digits',
  })
  @Matches(/^\d{4}$/, {
    message: 'OTP must contain only digits',
  })
  otp: string;
}
