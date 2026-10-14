import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum, IsOptional, IsString } from 'class-validator';
import { Status } from 'src/shared/enums';

export class CreateProcessInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  description: string;

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
