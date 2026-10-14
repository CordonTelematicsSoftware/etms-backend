import { ApiProperty } from '@nestjs/swagger';
import {
  // IsEmail,
  // IsNumber,
  IsOptional,
  IsString,
  // IsDate,
} from 'class-validator';

export class AuthenticationUserInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsString()
  userType?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsString()
  name?: string;
}
