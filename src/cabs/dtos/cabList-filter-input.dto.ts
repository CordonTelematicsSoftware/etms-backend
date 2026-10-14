import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { SortOrder } from 'src/shared/enums';

export class CabListFilterInput {
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
    description:
      'Filter by expiry type (expired, withinOneWeek, withinOneMonth)',
  })
  @IsOptional()
  @IsString()
  @IsIn(['expired', 'withinOneWeek', 'withinOneMonth'])
  expiryType?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by number of seats in the cab.',
  })
  @IsOptional()
  @IsString()
  noOfSeats?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status: string;

  @ApiProperty({
    required: false,
    description:
      'Filter by fuel type (petrol, diesel, electric, cng, lpg, hybrid)',
  })
  @IsOptional()
  @IsString()
  @IsIn(['Petrol', 'Diesel', 'Electric', 'CNG', 'LPG', 'Hybrid'])
  fuelType?: string;

  // @ApiProperty({
  //   required: false,
  // })
  // @IsOptional()
  // @IsString()
  // vendorID?: string;
}
