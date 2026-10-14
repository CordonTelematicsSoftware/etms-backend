// create-complete-trip.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SecurityAttendanceDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  tripID: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  otp: string;
}
