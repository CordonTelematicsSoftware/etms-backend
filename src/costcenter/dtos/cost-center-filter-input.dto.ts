import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class CostcenterFilterInput extends ListOptionInput {
  @ApiProperty({
    required: false,
    default: 'id',
    enum: ['id', 'name', 'createdAt'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['id', 'name', 'createdAt'])
  sortBy: string;

  @ApiProperty({ required: false, default: SortOrder.ASC, enum: SortOrder })
  @IsOptional()
  @IsString()
  @IsIn([SortOrder.DESC, SortOrder.ASC])
  sortOrder: SortOrder.DESC | SortOrder.ASC;
}
