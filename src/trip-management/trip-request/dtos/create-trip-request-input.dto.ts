import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Status } from 'src/shared/enums';

export class CreateTripRequestInput {
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

  @ApiProperty({ required: false })
  @IsOptional()
  pickDrop: boolean;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsEnum(Status)
  status?: string;

  @IsOptional()
  @IsString()
  emergencyType?: string;

  @IsOptional()
  @IsString()
  locationType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  officeLocation?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @Type(() => String)
  employeeCodes?: string[];

  // for selected Oraganization select only
  @IsOptional()
  @IsString()
  selectedOrgID?: string;

  @IsOptional()
  @IsString()
  guestEmployeeID?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
