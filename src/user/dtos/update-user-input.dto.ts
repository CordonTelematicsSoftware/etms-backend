import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateUserInput } from './create-user-input.dto';
import { IsBoolean, IsDate, IsOptional, IsString } from 'class-validator';

export class UpdateUserInput extends PartialType(CreateUserInput) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  lastLogin?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userType?: string;
}
