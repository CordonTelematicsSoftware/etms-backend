import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsObject, IsOptional, IsString } from 'class-validator';

interface State {
  label: string;
  value: string;
}

export class CreateCityInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({ required: false, default: null, type: Object })
  @IsOptional()
  @IsObject()
  state: State;
}
