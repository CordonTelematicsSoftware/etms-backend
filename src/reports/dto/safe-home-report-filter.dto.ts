// src/reports/dto/safe-home-report-filter.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Gender, SAFE_HOME_STATUS } from 'src/shared/enums';

/**
 * The GET report route receives these through the Express `qs` parser, so every
 * leaf arrives as a string. The POST export route receives the same shape as
 * real JSON. Each @Transform below has to tolerate both.
 */

const toArray = ({ value }) => {
  if (Array.isArray(value)) return value;
  // qs has arrayLimit 20: past that it hands back {0:…,1:…} instead of an
  // array, which would otherwise be wrapped whole and fail @IsString each.
  if (value && typeof value === 'object') return Object.values(value);
  return [value].filter(Boolean);
};

const toBoolean = ({ value }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class DateRangeDto {
  @ApiProperty({ example: '2026-08-01', required: false })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ example: '2026-08-10', required: false })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class SafeHomeFiltersDto {
  @ApiProperty({ required: false, type: DateRangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeDto)
  dateRange?: DateRangeDto;

  @ApiProperty({ required: false, type: [String], example: ['E1001', 'E1002'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(toArray)
  empCode?: string[];

  @ApiProperty({
    required: false,
    type: Boolean,
    description: 'Filter by pickup (true) or drop (false)',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(toBoolean)
  pickDrop?: boolean;

  @ApiProperty({
    required: false,
    type: [String],
    example: [SAFE_HOME_STATUS.SAFE_PIN, SAFE_HOME_STATUS.PENDING],
    description: 'Filter by derived safe-home status',
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(SAFE_HOME_STATUS), { each: true })
  @Transform(toArray)
  status?: string[];

  // Inclusion is evidence-based, not gender-based, so this only narrows what is
  // already in the report. Omit it entirely to mean "every gender" — sending all
  // three values instead would drop employees with no gender recorded, because
  // Employee.gender is nullable and Op.in excludes NULL.
  @ApiProperty({
    required: false,
    type: [String],
    example: [Gender.Female],
    description: 'Filter by employee gender',
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(Gender), { each: true })
  @Transform(toArray)
  gender?: string[];
}

export class SafeHomeReportFilterDto {
  @ApiProperty({ required: false, type: SafeHomeFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SafeHomeFiltersDto)
  filters?: SafeHomeFiltersDto;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  skip?: number = 0;

  // No @Max here: the service pages in memory after the derived-status filter,
  // so a caller may legitimately ask for the whole result set.
  @ApiProperty({ required: false, default: 25 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  take?: number = 25;

  // Deliberately no search/sortBy/sortOrder: getSafeHomeReport reads only
  // filters/skip/take and buildRows hardcodes an ORDER BY deboardTime DESC.
  // Declaring them would document a contract the service does not honour.
}

/** Export twin envelope — the export services all read `exportFilters`. */
export class SafeHomeReportExportDto {
  @ApiProperty({ required: false, type: SafeHomeFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SafeHomeFiltersDto)
  exportFilters?: SafeHomeFiltersDto;
}
