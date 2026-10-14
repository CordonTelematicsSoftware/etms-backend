// dtos/mark-attendance-input.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ConfirmSafeHomeByPinInput {
  @ApiProperty({
    description: 'Trip Request ID',
    example: '7889',
  })
  @IsNotEmpty()
  @IsString()
  tripRequestID: string;

  @ApiProperty({
    description: 'Employee 4-digit security PIN',
    example: '1234',
  })
  @IsNotEmpty()
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'Security PIN must contain only digits' })
  securityPin: string;
}
