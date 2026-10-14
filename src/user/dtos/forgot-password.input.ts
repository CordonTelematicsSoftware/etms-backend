import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsString,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpdatePasswordInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  token: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password is too weak',
  })
  newPassword: string;
}
