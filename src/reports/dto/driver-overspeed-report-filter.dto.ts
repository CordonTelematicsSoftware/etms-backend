import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { SortOrder } from 'src/shared/enums';

export class DriverOverspeedReportFilterDto {
  @ApiProperty({ required: true })
  @IsString()
  startDate: string;

  @ApiProperty({ required: true })
  @IsString()
  endDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  driverCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  skip?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  take?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn([SortOrder.ASC, SortOrder.DESC])
  sortOrder?: SortOrder;
}
