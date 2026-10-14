// dtos/mark-attendance-input.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MarkAttendanceInput {
  @ApiProperty({
    description: 'Trip Request ID',
    example: '7889',
  })
  @IsNotEmpty()
  @IsString()
  tripRequestID: string;

  @ApiProperty({
    description: 'Employee ID',
    example: '9317',
  })
  @IsNotEmpty()
  @IsString()
  employeeID: string;

  @ApiProperty({
    required: false,
    description:
      'Geocode of the location from where the employee mark attendance',
    // example: '7889',
  })
  @IsOptional()
  attendanceLocation: string;
}
