import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  IsEnum,
  IsNotEmpty,
  IsDate,
} from 'class-validator';
import { Gender, Status } from 'src/shared/enums';

export class CreateSecurityInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  name: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  securityCode: string;

  @ApiProperty({
    required: true,
    enum: Gender,
  })
  @IsOptional()
  // @IsDefined()
  @IsEnum(Gender)
  gender?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  phone1?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  phone2?: string;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  status?: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => new Date(value))
  dob: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyContactNo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  aadharNumber?: string;
}
