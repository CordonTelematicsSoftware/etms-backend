import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString } from 'class-validator';

export class CreateBrandInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;
}
