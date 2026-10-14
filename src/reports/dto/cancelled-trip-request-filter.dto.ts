import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsArray,
  IsNotEmpty,
  IsNumber,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CancelledTripRequestFilterDto {
  @ApiProperty({ required: true, type: String })
  @IsNotEmpty()
  @IsString()
  startDate: string;

  @ApiProperty({ required: true, type: String })
  @IsNotEmpty()
  @IsString()
  endDate: string;

  @ApiProperty({ required: false, type: [String], isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  loginTimes?: string[];

  @ApiProperty({ required: false, type: [String], isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  logoutTimes?: string[];

  @ApiProperty({ required: false, type: Number })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  skip?: number;

  @ApiProperty({ required: false, type: Number })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  take?: number;

  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
