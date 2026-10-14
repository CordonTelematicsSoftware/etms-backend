import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsString, Length } from 'class-validator';

export class CreateCompanyConfigInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @Length(2)
  @Transform(({ value }) => value.trim())
  configValue: string;

  @ApiProperty({ required: true })
  @IsDefined()
  configID?: bigint;

  @ApiProperty({ required: true })
  @IsDefined()
  orgID?: bigint;
}
