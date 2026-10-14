import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDefined, IsString } from 'class-validator';

export class UpdateOrgDriverInput {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsDefined()
  ids: string[];

  @ApiProperty()
  @IsDefined()
  @IsString()
  status: string;
}
