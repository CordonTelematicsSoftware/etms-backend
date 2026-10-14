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
import { EmployeeType, Gender, Status } from 'src/shared/enums';
import { Trim, TrimCollapse } from 'src/shared/utils/trim.transform';

export class CreateEmployeeInput {
  @Transform(TrimCollapse)
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  name: string;

  @Transform(TrimCollapse)
  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  employeeCode: string;

  @Transform(Trim)
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    required: true,
    enum: Gender,
  })
  @IsDefined()
  @IsEnum(Gender)
  gender?: string;

  @ApiProperty({
    required: false,
    enum: EmployeeType,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(EmployeeType)
  employeeType?: string;

  @Transform(Trim)
  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  phone?: string;

  @Transform(Trim)
  @ApiProperty({ required: false, default: null })
  @IsOptional()
  designation?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  orgID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  locationID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  roleID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  teamID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  processID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  costcenterID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  commonPointID?: bigint;

  @ApiProperty({ required: false })
  @IsOptional()
  homePoint: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => new Date(value))
  joinedDate: Date;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : null))
  exitDate: Date;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  specialConsideration?: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => new Date(value))
  dob: string;

  @Transform(Trim)
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address: string;

  @Transform(Trim)
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  landmark: string;

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
}
