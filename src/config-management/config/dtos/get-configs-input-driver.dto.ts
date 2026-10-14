import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty, IsOptional } from 'class-validator';

export class DriverMultipleConfigValuesDto {
  @ApiProperty({
    type: [String],
    example: ['config1', 'config2', 'config3'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  configNames: string[];

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  orgID?: bigint;
}
