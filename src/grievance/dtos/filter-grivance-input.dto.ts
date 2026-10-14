import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ListOptionInput } from 'src/shared/dtos/filter.input';

export class FilterGrievanceInput extends ListOptionInput {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  status: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  createdById: number;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  startDate: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  endDate: string;
}
