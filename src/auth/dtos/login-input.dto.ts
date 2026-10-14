import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString, IsOptional } from 'class-validator';

export class LoginInput {
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

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deviceNo: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deviceToken: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deviceType: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  appVersion: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  osVersion: string;
}

export class OtpVerificationInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  phone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  otp?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deviceNo: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deviceToken: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deviceType: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  appVersion: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  osVersion: string;
}

export class AdminOtpVerificationInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  phone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  otp?: string;
}
