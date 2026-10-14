import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class ReportsFilter extends IntersectionType(ListOptionInput) {
  @ApiProperty({
    required: false,
    default: 'id',
    enum: ['id', 'createdAt'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['id', 'createdAt'])
  sortBy: string;

  @ApiProperty({ required: false, default: SortOrder.ASC, enum: SortOrder })
  @IsOptional()
  @IsString()
  @IsIn([SortOrder.DESC, SortOrder.ASC])
  sortOrder: SortOrder.DESC | SortOrder.ASC;

  @ApiProperty({ required: false, type: Boolean })
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true')
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  startDate?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  endDate?: Date;
}
