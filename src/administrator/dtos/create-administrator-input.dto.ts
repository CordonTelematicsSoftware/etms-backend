import { ApiProperty } from '@nestjs/swagger';
import {
  // IsBoolean,
  IsDefined,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Gender } from 'src/shared/enums';

export class CreateAdminInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  fullName: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  phone: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  password: string;

  @ApiProperty({
    required: false,
    enum: Gender,
  })
  @IsDefined()
  @IsEnum(Gender)
  gender?: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  roleID: string;
}
