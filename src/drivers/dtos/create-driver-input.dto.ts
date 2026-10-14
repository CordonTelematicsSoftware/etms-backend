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
import { Status } from 'src/shared/enums';

export class CreateDriverInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  //   @IsDefined()
  @IsString()
  password: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  aadharNumber?: string;

  @ApiProperty({ required: false })
  @IsDefined()
  @IsDate()
  @Transform(({ value }) => new Date(value))
  dob: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  image: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  licenseNo?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => new Date(value))
  licenseExpiry: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  badgeNo?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  // @IsDate()
  // @Transform(({ value }) => (value ? new Date(value) : null))
  @Transform(({ value }) => {
    if (!value || value === 'null' || value === 'Invalid date') return null;
    return new Date(value);
  })
  badgeExpiry: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === 'null' || value === 'Invalid date') return null;
    return new Date(value);
  })
  bgVerificationExpiry: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => new Date(value))
  policeClearenceExpiry: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => new Date(value))
  medFitExpiry: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  defaultCabRegNo?: string;

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

  // Frontend sends back the list of already-uploaded documents on edit
  // forms (for display/reference) — not a real model column, never
  // persisted. Declared here only so update() can delete it off the
  // DTO-typed object before diffing/persisting, instead of `as any`.
  @ApiProperty({ required: false })
  @IsOptional()
  existingDocuments?: any;
}
