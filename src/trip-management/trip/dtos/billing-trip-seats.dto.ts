import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';
import { BillingTripEmployeeBaseDto } from './billing-trip-employees.dto';

// Trip.seats is a STRING column, but every existing reader does numeric
// arithmetic against it (getVehicleBillingRate comparisons, the
// estimatedOccupancy ceiling check). Digits only, so a non-numeric value
// cannot reach either.
const SEATS = /^\d+$/;

export class BillingTripSeatsDto extends BillingTripEmployeeBaseDto {
  @ApiProperty({ required: true, example: '6' })
  @IsNotEmpty({ message: 'seats is required' })
  @Matches(SEATS, { message: 'seats must be a whole number' })
  seats: string;
}
