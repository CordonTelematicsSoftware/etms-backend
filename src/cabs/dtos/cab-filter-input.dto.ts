import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class CabFilterInput extends ListOptionInput {
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
      'Filter by fuel type (petrol, diesel, electric, cng, lpg, hybrid, hydrogen)',
  })
  @IsOptional()
  @IsString()
  @IsIn(['Petrol', 'Diesel', 'Electric', 'CNG', 'LPG', 'Hybrid', 'Hydrogen'])
  fuelType?: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  vendorID?: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  orgID?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model: string;
}
