import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SetSecurityPinDto {
  @ApiProperty({ required: true })
  @IsString()
  securityPin: string;
}
