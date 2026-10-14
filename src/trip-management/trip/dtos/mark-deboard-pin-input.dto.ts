// dtos/mark-attendance-input.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class MarkDeboardViaPinInput {
  @ApiProperty({
    description: 'Trip Request ID',
    example: '7889',
  })
  @IsNotEmpty()
  @IsString()
  tripRequestID: string;

  @ApiProperty({
    description: 'Deboard location geocode',
    example: '184.002, 122.124',
  })
  @IsNotEmpty()
  @IsString()
  deboardLocation: string;

  @ApiProperty({
    description: 'Employee 4-digit security PIN',
    example: '1234',
  })
  @IsNotEmpty()
  @IsString()
  @Length(4, 4)
  securityPin: string;
}
