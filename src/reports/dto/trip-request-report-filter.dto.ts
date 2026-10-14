// src/report/dto/trip-request-report-filter.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SortOrder } from 'src/shared/enums';

export class TripRequestReportFilterDto {
  @ApiProperty({ example: '2025-05-16', required: false })
  @IsString()
  @IsOptional() // Changed from @IsNotEmpty to @IsOptional
  startDate?: string;

  @ApiProperty({ example: '2025-05-16', required: false })
  @IsString()
  @IsOptional() // Changed from @IsNotEmpty to @IsOptional
  endDate?: string;

  @ApiProperty({ type: [String], example: ['10:00', '9:30', '10:30'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : [value].filter(Boolean),
  )
  shiftTimes?: string[];

  @ApiProperty({
    type: [String],
    example: [
      'Active',
      'Inactive',
      'Requested',
      'Approved',
      'Rejected',
      'Cancelled',
    ],
    description: 'Filter trip requests by status',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : [value].filter(Boolean),
  )
  status?: string[];

  @ApiProperty({
    required: false,
    type: Boolean,
    description: 'Filter by pickup (true) or drop (false)',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  pickDrop?: boolean;

  @ApiProperty({
    required: false,
    type: Boolean,
    description: 'Filter by attendance',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  attendance?: boolean;

  @ApiProperty({
    required: false,
    type: Boolean,
    description: 'Filter by no-show status',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  noShow?: boolean;

  // PARKED: TR Report Requests/Latest — needs (orgID,date) index.
  // @ApiProperty({
  //   required: false,
  //   type: Boolean,
  //   description:
  //     'When true, return only the newest request in each employee/date/shiftTime/pickDrop slot',
  // })
  // @IsOptional()
  // @IsBoolean()
  // @Transform(({ value }) => {
  //   if (value === 'true') return true;
  //   if (value === 'false') return false;
  //   return value;
  // })
  // latestOnly?: boolean;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  skip?: number = 0;

  @ApiProperty({ required: false, default: 25 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  take?: number = 25;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    required: false,
    default: 'date',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'date';

  @ApiProperty({ required: false, default: SortOrder.DESC })
  @IsOptional()
  @IsString()
  sortOrder?: SortOrder.DESC | SortOrder.ASC = SortOrder.DESC;
}
