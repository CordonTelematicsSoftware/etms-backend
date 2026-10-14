import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

class LatLngPointDto {
  @ApiProperty()
  @IsNumber()
  lat: number;

  @ApiProperty()
  @IsNumber()
  lng: number;
}

export class SaveRouteCacheDto {
  @ApiProperty({ enum: ['actual', 'planned'] })
  @IsIn(['actual', 'planned'])
  routeType: 'actual' | 'planned';

  @ApiProperty({ type: [LatLngPointDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LatLngPointDto)
  points: LatLngPointDto[];

  @ApiProperty({
    description:
      'Hash of the ordered input coordinates that produced this route',
  })
  @IsNotEmpty()
  @IsString()
  waypointsHash: string;
}
