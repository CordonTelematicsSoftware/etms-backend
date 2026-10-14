import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, Matches } from 'class-validator';

const NUMERIC_ID = /^\d+$/;

export class CordonLastLocationsInput {
  @ApiProperty({ required: true, type: [String] })
  @IsArray({ message: 'tripIds must be an array' })
  @ArrayNotEmpty({ message: 'tripIds must not be empty' })
  @ArrayMaxSize(500, { message: 'tripIds must not exceed 500 items' })
  @Matches(NUMERIC_ID, { each: true, message: 'each tripId must be numeric' })
  tripIds: string[];
}
