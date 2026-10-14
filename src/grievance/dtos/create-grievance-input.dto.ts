import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateGrievanceInput {
  @ApiProperty({ required: true })
  @IsString()
  categoryId: string;

  @ApiProperty({ required: true })
  @IsString()
  description: string;

  @ApiProperty({ required: true })
  @IsString()
  status: string;
}
