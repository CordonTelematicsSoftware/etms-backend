// etms-filter-input.dto.ts
import { Type } from 'class-transformer';
import { IsOptional, IsNumber, IsString } from 'class-validator';

export class ETMSFilterInput {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  take?: number = 25;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  skip?: number = 0;

  @IsOptional()
  @IsString()
  month?: string; // Format: YYYY-MM

  @IsOptional()
  @IsString()
  search?: string;
}
