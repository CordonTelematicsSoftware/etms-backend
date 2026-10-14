import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserPermissionsInput {
  @ApiProperty({
    required: false,
    default: null,
    type: Array<string>,
  })
  @IsOptional()
  @IsArray()
  @Type(() => String)
  permissions?: string[];
}
