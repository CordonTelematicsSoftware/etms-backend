import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Status } from 'src/shared/enums';

export class UpdateOrganizationInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  phone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  gstNo: string;

  @ApiProperty({ required: false })
  @IsOptional()
  address: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  state: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  country: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  location: string;

  @ApiProperty({ required: false })
  @IsOptional()
  geoCode: string;

  @ApiProperty({ required: false })
  @IsOptional()
  logo: string;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  status?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  cityID?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  domainName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  empName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  empPassword: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  empEmail: string;

  @ApiProperty({ required: false })
  @IsOptional()
  empPhone: string;
}
