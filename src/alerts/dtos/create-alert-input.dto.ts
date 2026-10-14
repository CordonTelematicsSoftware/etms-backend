// create-alert-input.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsIn,
  IsEnum,
} from 'class-validator';
import { ReadStatus } from 'src/shared/enums';

export class AlertCreateFilterInput {
  @ApiProperty({
    description: 'Location coordinates or description',
    example: '12.9716,77.5946',
  })
  @IsNotEmpty()
  @IsString()
  location: string;

  @ApiProperty({
    description: 'Alert remarks or comments',
    example: 'Emergency situation - cab breakdown',
  })
  @IsNotEmpty()
  @IsString()
  remarks: string;

  @ApiProperty({
    description: 'Trip ID associated with this alert',
    example: '12345',
  })
  @IsNotEmpty()
  @IsString()
  tripID: string; // Made required since alerts are trip-specific

  @ApiPropertyOptional({
    description: 'Type of alert',
    example: 'alert',
    enum: ['alert'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['alert', 'sos'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Source of alert - will be auto-determined from user',
    example: 'Employee',
    enum: ['Employee', 'Driver'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['Employee', 'Driver', 'System Generated'])
  source?: string; // Make optional since it will be determined from user context

  @ApiProperty({
    required: false,
    enum: ReadStatus,
    default: ReadStatus.Pending,
  })
  @IsOptional()
  @IsEnum(ReadStatus)
  status?: string;
}
