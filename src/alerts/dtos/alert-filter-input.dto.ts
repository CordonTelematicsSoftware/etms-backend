// alert-filter-input.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class AlertFilterInput extends ListOptionInput {
  @ApiProperty({
    required: false,
    default: 'id',
    enum: ['id', 'source', 'type', 'createdAt', 'tripID'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['id', 'source', 'type', 'createdAt', 'tripID'])
  sortBy: string;

  @ApiProperty({ required: false, default: SortOrder.DESC, enum: SortOrder })
  @IsOptional()
  @IsString()
  @IsIn([SortOrder.DESC, SortOrder.ASC])
  sortOrder: SortOrder.DESC | SortOrder.ASC;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  filter?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by alert type',
    example: 'emergency',
    enum: [
      'alert',
      'sos',
      'emergency',
      'breakdown',
      'accident',
      'delay',
      'other',
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'alert',
    'sos',
    'emergency',
    'breakdown',
    'accident',
    'delay',
    'other',
    'notification',
  ])
  type?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by source (Employee, Driver or System Generated)',
    example: 'Employee',
    enum: ['Employee', 'Driver', 'System Generated'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['Employee', 'Driver', 'System Generated'])
  source?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by specific trip ID',
    example: '12345',
  })
  @IsOptional()
  @IsString()
  tripID?: string;

  @ApiProperty({
    required: false,
    description: 'Start date filter (YYYY-MM-DD)',
    example: '2025-06-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({
    required: false,
    description: 'End date filter (YYYY-MM-DD)',
    example: '2025-06-30',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({
    required: false,
    description: 'Search by location or remarks',
    example: 'emergency',
  })
  //   @IsOptional()
  @IsString()
  search: string;
  @ApiProperty({
    required: false,
    description: 'Filter by specific employee ID',
    example: '9344',
  })
  @IsOptional()
  @IsString()
  employeeID?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by specific vendor ID',
    example: '123',
  })
  @IsOptional()
  @IsString()
  vendorID?: string;
}
