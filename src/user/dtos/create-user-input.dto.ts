import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsOptional, IsString, IsArray } from 'class-validator';

export class CreateUserInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  userType: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleID?: string;

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
