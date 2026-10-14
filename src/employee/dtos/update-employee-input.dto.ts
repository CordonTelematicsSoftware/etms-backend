import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateEmployeeInput } from './create-employee-input.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateEmployeeInput extends PartialType(CreateEmployeeInput) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  authStatus?: string;
}
