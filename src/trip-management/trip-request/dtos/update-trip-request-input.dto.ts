import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateTripRequestInput } from './create-trip-request-input.dto';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Status } from 'src/shared/enums';

export class UpdateTripRequestInput extends PartialType(
  CreateTripRequestInput,
) {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  attendanceOtp?: string;
}

export class UpdateTripStatusDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ required: true })
  @IsString()
  status: string;
}
export class EmergencyTripRequestInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsArray()
  @Type(() => String)
  selectedDates: string[];

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  loginTime: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  logoutTime: string | null;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Requested,
  })
  @IsOptional()
  @IsEnum(Status)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyType?: string;
}

export class EmployeeEmergencyTripRequestInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsArray()
  @Type(() => String)
  selectedDates: string[];

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  loginTime: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  logoutTime: string | null;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Requested,
  })
  @IsOptional()
  @IsEnum(Status)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyType?: string;

  @IsOptional()
  @IsString()
  locationType?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
