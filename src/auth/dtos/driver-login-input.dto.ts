import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString, IsOptional } from 'class-validator';

export class DriverLoginInput {
  @ApiProperty({ required: false })
  @IsDefined()
  @IsString()
  @IsOptional()
  phone: string;

  @ApiProperty({ required: false })
  @IsDefined()
  @IsString()
  @IsOptional()
  email: string;

  @ApiProperty({ required: false })
  @IsDefined()
  @IsString()
  @IsOptional()
  password: string;
}

export class DriverOtpVerificationInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  phone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  otp?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recaptchaToken?: string; // reCaptcha token added
}
