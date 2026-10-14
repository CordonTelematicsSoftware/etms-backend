import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  IsEnum,
  IsNotEmpty,
  IsDate,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Status } from 'src/shared/enums';

export class CreateCabInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsNotEmpty({ message: 'Registration Number is required.' })
  regNo: string;

  // An empty string means "clear the IMEI" (the edit form posts multipart, so a
  // cleared input arrives as ''). ValidateIf lets it through alongside null; the
  // service normalises both to null before writing.
  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @ValidateIf((o) => o.imei !== '')
  @IsString()
  @Matches(/^\d{15}$/, { message: 'IMEI must be exactly 15 digits.' })
  imei?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  brandID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  driverID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  driver2ID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  model?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  fuelType?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : null))
  manufacturingDate?: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : null))
  rcExpiry: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rcOwner?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subVendorName?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  noOfSeats?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  insuranceNumber?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  insuranceProvider?: string;

  @ApiProperty({ required: true })
  @IsDate()
  @Transform(({ value }) => new Date(value))
  insuranceEndDate: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : null))
  pollutionEndDate: Date;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsDate()
  @Transform(({ value }) => new Date(value))
  fitnessExpiry: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : null))
  taxExpiry: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : null))
  permitExpiry: Date;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  status?: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    required: false,
    description: 'Document files to upload',
  })
  documents?: any[];

  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    required: false,
    description: 'Document titles corresponding to files',
  })
  documentTitles?: string[];

  // Same as Driver — frontend echoes back existing documents on edit,
  // not a real column. Declared so it can be deleted off the typed
  // object cleanly.
  @ApiProperty({ required: false })
  @IsOptional()
  existingDocuments?: any;
}
