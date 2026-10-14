// create-complete-trip.dto.ts
import { IsNotEmpty, IsString, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteTripDto {
  @ApiProperty({
    description: 'Trip ID to be completed',
    example: '1805',
  })
  @IsNotEmpty()
  @IsString()
  tripID: string;
}

// Alternative if you want to be more strict about numeric IDs:
export class CompleteTripDtoNumeric {
  @ApiProperty({
    description: 'The ID of the trip to complete',
    example: '2013',
    type: String,
  })
  @IsNotEmpty({ message: 'Trip ID is required' })
  @IsNumberString({}, { message: 'Trip ID must be a valid number' })
  tripID: string;
}
