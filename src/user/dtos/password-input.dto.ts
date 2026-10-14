import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsEmail,
  IsString,
  Matches,
  IsOptional,
} from 'class-validator';
import { Match } from 'src/shared/utils/custom-validators/passwords-match.validator';
import regularExpressions from 'src/shared/validations/regularExpression';

export class ResetPasswordInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  oldPassword: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  newPassword: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @Match('newPassword')
  confirmPassword: string;
}

export class ForgotPasswordInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsEmail()
  @Matches(regularExpressions.email, { message: 'Invalid email format' })
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recaptchaToken?: string; // reCaptcha token added
}
