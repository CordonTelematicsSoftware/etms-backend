import { ApiProperty } from '@nestjs/swagger';

import {
  IsDefined,
  IsOptional,
  IsString,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { Status } from 'src/shared/enums';

export class CreateLocationInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  name: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  geoCode: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tripTime: string;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  status?: string;
}
