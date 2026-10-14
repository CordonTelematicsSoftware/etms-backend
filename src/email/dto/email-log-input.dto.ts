import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsOptional } from 'class-validator';

export class EmailLogInput {
  @ApiProperty({ required: true })
  @IsDefined()
  toAddress: string;

  @ApiProperty({ required: true })
  @IsDefined()
  purpose: string;

  @ApiProperty({ required: true })
  @IsDefined()
  status: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  error: any;
}
