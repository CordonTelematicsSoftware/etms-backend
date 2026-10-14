import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty } from 'node_modules/@nestjs/swagger';
import { DateRangeType, Status } from 'src/shared/enums';

export class CreateReportSchedulerDto {
  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  reportName: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  orgID?: bigint;

  @ApiProperty({
    required: true,
    example: ['mon', 'tue'],
    description: 'Allowed values: Mon, Tue, Wed, Thu, Fri, Sat, Sun',
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Frequency must contain at least one day',
  })
  @Matches(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/, {
    each: true,
    message: 'Frequency must contain only: Mon, Tue, Wed, Thu, Fri, Sat, Sun',
  })
  frequency: string[];

  @ApiProperty({
    required: true,
    example: ['11:00', '18:30'],
    description: 'Time must be in HH:mm (24-hour) format',
  })
  @IsArray()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    each: true,
    message: 'Time must be in HH:mm format',
  })
  time: string[];

  @ApiProperty({ enum: DateRangeType })
  @IsEnum(DateRangeType)
  dateRangeType: DateRangeType;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  employeeID?: bigint;

  @ApiProperty({ required: false })
  @IsOptional()
  employeeCode?: string;

  @ApiProperty()
  @IsNumber()
  dateRangeValue: number;

  @ApiProperty({ required: true, example: ['user@mail.com', 'users@mail.com'] })
  @IsArray()
  recipients: string[];

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  status?: string;
}
