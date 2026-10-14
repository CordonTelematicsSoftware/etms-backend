import { ApiProperty } from 'node_modules/@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CoPassengerCallInput {
  @ApiProperty({ example: '1805' })
  @IsNotEmpty()
  @IsString()
  tripID: string;

  @ApiProperty({ example: '31' })
  @IsNotEmpty()
  @IsString()
  employeeID: string;
}
