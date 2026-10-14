import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { SortOrder } from 'src/shared/enums';

export class DriverListFilterInput {
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

  // @ApiProperty({
  //   required: false,
  //   description: 'Filter by category (license, fitness, or policeClearence)',
  // })
  // @IsOptional()
  // @IsString()
  // @IsIn(['license', 'fitness', 'policeClearence'])
  // category?: string;

  @ApiProperty({
    required: false,
    description:
      'Filter by expiry type (expired, withinOneWeek, withinOneMonth)',
  })
  @IsOptional()
  @IsString()
  @IsIn(['expired', 'withinOneWeek', 'withinOneMonth'])
  expiryType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status: string;
}
