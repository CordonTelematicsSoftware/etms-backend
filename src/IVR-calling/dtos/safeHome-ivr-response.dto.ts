import { ApiProperty } from 'node_modules/@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SafeHomeIVRResponseDto {
  @ApiProperty()
  @IsString()
  call_id: string;

  @IsString()
  @IsOptional()
  call_status?: string;

  // @IsArray()
  @IsOptional()
  digits_dialed?: string[];

  @IsString()
  caller_id_number: string;

  @IsString()
  uuid: string;

  @IsString()
  call_to_number: string;

  @IsString()
  @IsOptional()
  digit_pressed?: string;
}
