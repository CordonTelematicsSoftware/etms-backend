// dtos/mark-attendance-input.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class MarkAttendanceViaQRInput {
  @ApiProperty({
    required: false,
    description: 'mark attendance by scanning qr',
  })
  @IsString()
  qrData: string;
}
