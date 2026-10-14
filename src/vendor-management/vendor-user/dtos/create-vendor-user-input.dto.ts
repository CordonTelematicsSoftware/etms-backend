import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateVendorUserInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  phone: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorUserID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorRoleID?: bigint;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsString()
  password?: string;
}
