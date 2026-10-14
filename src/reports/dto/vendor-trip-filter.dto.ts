// src/report/dto/trip-report-filter.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  // Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SortOrder } from 'src/shared/enums';

export class VendorTripReportFilterDto {
  @ApiProperty({ example: '2025-05-16', required: false })
  @IsString()
  @IsOptional() // Changed from @IsNotEmpty to @IsOptional
  startDate?: string;

  @ApiProperty({ example: '2025-05-16', required: false })
  @IsString()
  @IsOptional() // Changed from @IsNotEmpty to @IsOptional
  endDate?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  orgID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorID?: bigint;

  @ApiProperty({ type: [String], example: ['10:00', '9:30', '10:30'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : [value].filter(Boolean),
  )
  loginTimes?: string[];

  @ApiProperty({ type: [String], example: ['17:00', '17:30', '18:00'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : [value].filter(Boolean),
  )
  logoutTimes?: string[];

  @ApiProperty({
    type: [String],
    example: ['Pending', 'Confirmed', 'Completed'],
    description: 'Filter trips by status',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : [value].filter(Boolean),
  )
  status?: string[];

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
  // @Max(100)
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
