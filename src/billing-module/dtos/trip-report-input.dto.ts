import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class TripReportInput extends ListOptionInput {
  @ApiProperty({
    required: false,
    default: 'id',
    enum: ['id', 'date', 'status'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['id', 'date', 'status'])
  sortBy: string;

  @ApiProperty({ required: false, default: SortOrder.ASC, enum: SortOrder })
  @IsOptional()
  @IsString()
  @IsIn([SortOrder.DESC, SortOrder.ASC])
  sortOrder: SortOrder.DESC | SortOrder.ASC;

  @ApiProperty({ required: false })
  @IsOptional()
  vendorID?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  endDate?: string;
}
