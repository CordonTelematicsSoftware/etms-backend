import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// export class UpdateAuthenticationInput extends PartialType(
//   AuthenticationUserInput,
// ) {}

export class UpdateAuthenticationInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  //  @ApiProperty({ required: false, default: false })
  //  @IsOptional()
  //  @IsString()
  //  password?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsString()
  userType?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  enabled?: any;
}
