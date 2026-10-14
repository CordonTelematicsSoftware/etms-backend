import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class VendorRequestFilterInput extends ListOptionInput {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy: string;

  @ApiProperty({ required: false, default: SortOrder.ASC, enum: SortOrder })
  @IsOptional()
  @IsString()
  @IsIn([SortOrder.DESC, SortOrder.ASC])
  sortOrder: SortOrder.DESC | SortOrder.ASC;

  @ApiProperty({
    required: false,
    enum: ['pending', 'approved', 'cancelled', 'rejected', 'invited'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'cancelled', 'rejected', 'invited'])
  requestStatus: 'pending' | 'approved' | 'cancelled' | 'rejected' | 'invited';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  filter?: string;
}
