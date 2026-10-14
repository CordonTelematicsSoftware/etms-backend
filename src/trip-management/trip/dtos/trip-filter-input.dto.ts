import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class TripFilterInput extends ListOptionInput {
  @ApiProperty({
    required: false,
    default: 'id',
    enum: ['id', 'date', 'pickDrop', 'status'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['id', 'date', 'pickDrop', 'status', 'seats', 'shiftTime'])
  sortBy: string;

  @ApiProperty({ required: false, default: SortOrder.ASC, enum: SortOrder })
  @IsOptional()
  @IsString()
  @IsIn([SortOrder.DESC, SortOrder.ASC])
  sortOrder: SortOrder.DESC | SortOrder.ASC;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  filter?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  orgID?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  date?: string | null;

  @IsOptional()
  @IsString()
  search?: string;
}
