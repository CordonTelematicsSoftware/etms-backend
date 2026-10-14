import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Status } from 'src/shared/enums';

export class CreateTeamInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty()
  @IsOptional()
  processID?: string;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  shiftLoginTime?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  shiftLogoutTime?: string[];

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  isShiftEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  isTeamConfigEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  teamConfig?: any;

  @ApiProperty({ required: false })
  @IsOptional()
  workHours?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  isAutoLogoutEnabled?: boolean;
}
