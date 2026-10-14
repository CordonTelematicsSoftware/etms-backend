// dtos/mark-attendance-input.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MarkDeboardInput {
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
    description: 'Deboard location geocode',
    example: '184.002, 122.124',
  })
  @IsNotEmpty()
  @IsString()
  deboardLocation: string;
}
