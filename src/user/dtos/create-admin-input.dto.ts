import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAdminInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  fullName: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  phone: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  status: boolean;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  roleID: string;
}
