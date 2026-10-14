import { ApiProperty } from 'node_modules/@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class IVRCallInput {
  @ApiProperty()
  @IsString()
  @IsOptional()
  tripID?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  employeeID?: string;
}
