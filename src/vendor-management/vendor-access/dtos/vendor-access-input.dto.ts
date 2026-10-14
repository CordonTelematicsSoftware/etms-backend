// src/vendor-management/vendor-access/dtos/vendor-access-input.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class AddVendorAccessInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  //   @ApiProperty()
  //   @IsNotEmpty()
  //   @IsString()
  //   password: string;

  @ApiProperty({
    type: [String],
    description: 'Org IDs this sub-login may access',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one organization.' })
  orgIDs: string[];
}

export class UpdateVendorAccessInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one organization.' })
  orgIDs?: string[];
}
