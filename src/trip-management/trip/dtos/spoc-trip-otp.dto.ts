// create-complete-trip.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SecurityOtpDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  tripID: string;
}
