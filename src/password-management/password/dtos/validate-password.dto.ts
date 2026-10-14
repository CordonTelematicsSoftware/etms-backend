// validate-password.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidatePasswordDto {
  @ApiProperty({})
  // @IsUUID()
  @IsOptional()
  employeeID?: bigint;

  @IsString()
  // @IsUUID()
  orgID?: bigint;

  @ApiProperty({
    description: 'The password to validate',
    example: 'P@ssw0rd123!',
  })
  @IsNotEmpty()
  @IsString()
  password: string;
}
