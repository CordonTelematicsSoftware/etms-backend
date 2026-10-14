import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDefined, IsOptional, IsString } from 'class-validator';

export class CreateRouteInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({ required: false, default: null, type: Array })
  @IsOptional()
  // @IsObject()
  @IsArray()
  zoneIDs: number[];
}
