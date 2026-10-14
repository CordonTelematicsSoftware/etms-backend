import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class MarkAttendanceViaPinInput {
  @ApiProperty({
    example: '12345',
    description: 'Trip Request ID',
  })
  @IsString()
  @IsNotEmpty()
  tripRequestID: string;

  @ApiProperty({
    example: '1234',
    description: '4-digit security PIN',
  })
  @IsString()
  @Length(4, 4)
  securityPin: string;

  @ApiProperty({
    example: '12.9716,77.5946',
    description: 'Attendance location',
  })
  @IsString()
  @IsNotEmpty()
  attendanceLocation: string;
}
