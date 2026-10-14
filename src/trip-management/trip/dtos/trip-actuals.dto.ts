import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

// actualStartDate/actualEndDate are DATE columns in TripActuals; a malformed
// string reaches Postgres as a cast error (a 500). Validate the shape here.
//
// Both 'YYYY-MM-DD' and a full ISO timestamp are accepted: because the column
// is DATE, a GET hands back '2026-07-21T00:00:00.000Z', and a client that
// round-trips a value it just read must not be rejected. The service
// normalises to 'YYYY-MM-DD' before writing.
const DATE_FORMAT =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
// actualStartTime/actualEndTime are STRING columns, so they round-trip
// unchanged and need no ISO variant.
const TIME_FORMAT = /^\d{2}:\d{2}(:\d{2})?$/;

export class TripActualsDto {
  @ApiProperty({ required: true })
  @IsDefined()
  tripID: number;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  @Matches(DATE_FORMAT, { message: 'actualStartDate must be YYYY-MM-DD' })
  actualStartDate: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  @Matches(TIME_FORMAT, {
    message: 'actualStartTime must be HH:mm or HH:mm:ss',
  })
  actualStartTime: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  @Matches(DATE_FORMAT, { message: 'actualEndDate must be YYYY-MM-DD' })
  actualEndDate: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  @Matches(TIME_FORMAT, { message: 'actualEndTime must be HH:mm or HH:mm:ss' })
  actualEndTime: string | null;

  @ApiProperty({ required: true })
  @IsNumber()
  @IsOptional()
  //   @IsDefined()
  actualDistance: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  actualCost?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  //   @IsDefined()
  billingRate?: Record<string, any>;

  @ApiProperty({ required: false })
  @IsOptional()
  remarks?: string;

  // The global ValidationPipe has transform:true but no implicit conversion,
  // so @Type is needed for a numeric string to satisfy @IsNumber.
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  actualCostOverride?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isCostOverridden?: boolean;
}
