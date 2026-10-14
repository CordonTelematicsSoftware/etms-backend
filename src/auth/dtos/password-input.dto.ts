import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsString,
  Matches,
  IsOptional,
} from 'class-validator';
import regularExpressions from 'src/shared/validations/regularExpression';

export class ResetPasswordInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  password: string;
}

export class ForgotPasswordInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsEmail()
  @Matches(regularExpressions.email, { message: 'Invalid email format' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recaptchaToken?: string; // reCaptcha token added
}

export class ChangePasswordInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  password: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  oldPassword: string;
}
