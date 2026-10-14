import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class DriverOverspeedInput {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  tripId: string;

  @ApiProperty({
    required: true,
    description: 'Location coordinates',
    example: '12.9716,77.5946',
  })
  @IsNotEmpty()
  @IsString()
  location: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsNumber()
  currentSpeed: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  speedLimit: number;
}
