import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class GetMultipleConfigValuesDto {
  @ApiProperty({
    type: [String],
    example: ['config1', 'config2', 'config3'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  configNames: string[];
}
