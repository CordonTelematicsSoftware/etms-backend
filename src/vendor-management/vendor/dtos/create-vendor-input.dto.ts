import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Status } from 'src/shared/enums';

export class CreateVendorInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  code: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  phone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  logo: string;

  @ApiProperty({ required: false })
  @IsOptional()
  address: string;

  @ApiProperty({ required: false })
  @IsOptional()
  gstNo: string;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  status?: string;
  // }

  // export class CreateVendorUserByVendorInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  vendorUserName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorUserEmail: string;

  @ApiProperty({ required: false })
  @IsOptional()
  vendorUserPhone: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorRoleID?: bigint;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorUserPassword?: string;
}
