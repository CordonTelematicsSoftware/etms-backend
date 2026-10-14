import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class OrgDriverFilterInput extends ListOptionInput {
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orgID?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorID?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  // Add search parameter
  @ApiProperty({
    required: false,
    description: 'Search term for driver name, code, or other fields',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  driverID?: string;

  @ApiProperty({
    required: false,
    description:
      'Trip date (YYYY-MM-DD) — scopes the exclusion to drivers already booked on this date',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiProperty({
    required: false,
    description:
      'Trip shift time — scopes the exclusion to drivers already booked in this shift',
  })
  @IsOptional()
  @IsString()
  shiftTime?: string;

  @ApiProperty({
    required: false,
    description:
      'Pick or Drop — scopes the exclusion to the same trip direction',
  })
  @IsOptional()
  @IsString()
  pickDrop?: string;

  @ApiProperty({
    required: false,
    description:
      'Comma-separated trip IDs currently open for editing in the same session — these trips are excluded from the "already booked this shift" conflict check, so drivers already on one of THESE trips can be freely reassigned to another one of THESE trips without a false conflict.',
  })
  @IsOptional()
  @IsString()
  currentTripIDs?: string;
}
