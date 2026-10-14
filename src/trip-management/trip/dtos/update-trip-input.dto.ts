import { ApiProperty } from '@nestjs/swagger';
import { CreateTripInput } from './create-trip-input.dto';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateTripInput {
  @ApiProperty({
    required: true,
    type: [CreateTripInput],
    description: 'Array of trip updates including IDs',
  })
  updatedTrips: (CreateTripInput & { id: string })[];

  @ApiProperty({ required: false, default: null, type: Array })
  @IsOptional()
  // @IsObject()
  @IsArray()
  removedTrips: number[];
}

export class UpdateTripStatusDto {
  @ApiProperty({ required: true })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ required: true })
  @IsString()
  status: string;
}

export class DriverMarkNoShowDto {
  @ApiProperty({
    description: 'Trip ID',
    example: '1805',
  })
  @IsNotEmpty()
  @IsString()
  tripId: string;

  @ApiProperty({
    description: 'Employee ID',
    example: '123',
  })
  @IsNotEmpty()
  @IsString()
  employeeId: string;
}

export class DriverMarkNearbyDto {
  @ApiProperty({
    description: 'Trip ID',
    example: '1805',
  })
  @IsNotEmpty()
  @IsString()
  tripId: string;

  @ApiProperty({
    description: 'Employee ID',
    example: '123',
  })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({
    description: 'Driver current location',
    example: '1.1254,4.125',
  })
  @IsNotEmpty()
  @IsString()
  location?: string;
}
