import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GrievanceStatusChangeInput {
  @ApiProperty({ required: true })
  @IsString()
  @IsOptional()
  status: string;

  @ApiProperty({ required: true })
  @IsString()
  @IsOptional()
  remarks: string;
}
