// dtos/helpdesk-call.dto.ts
import { ApiProperty } from 'node_modules/@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class HelpdeskCallInput {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  tripID?: string; // not used yet, reserved in case you want call history tied to an active trip later
}
