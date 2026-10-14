// dtos/mark-attendance-input.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MarkCabReachedInput {
  //   @ApiProperty({
  //     description: 'Trip Request ID',
  //     example: '7889',
  //   })
  //   @IsNotEmpty()
  //   @IsString()
  //   tripRequestID: string;

  @ApiProperty({
    description: 'Trip ID',
    example: '6599',
  })
  @IsNotEmpty()
  @IsString()
  tripID: string;

  @ApiProperty({
    description: 'Employee ID',
    example: '9317',
  })
  @IsOptional()
  @IsString()
  employeeID?: string;
}
