import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateConfigInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @Length(2)
  @Transform(({ value }) => value.trim())
  configName: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsArray()
  configValue: string[];

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @Transform(({ value }) => value.trim())
  defaultValue: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsBoolean()
  editable: boolean;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsBoolean()
  viewable: boolean;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class GetCutOffDto {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsIn(['Upper cut off', 'Lower cut off'], {
    message: 'Type must be "Upper cut off" or "Lower cut off".',
  })
  type: string;
}
