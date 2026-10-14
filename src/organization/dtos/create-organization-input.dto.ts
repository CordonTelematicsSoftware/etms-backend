import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  //   Matches,
} from 'class-validator';
import { Status, UserType } from 'src/shared/enums';
// import regularExpressions from 'src/shared/validations/regularExpression';

export class CreateOrganizationInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
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

  @ApiProperty({ required: false })
  @IsOptional()
  state: string;

  @ApiProperty({ required: false })
  @IsOptional()
  country: string;

  @ApiProperty({ required: false })
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

  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  empName: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  empCode: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  empEmail: string;

  @ApiProperty({ required: false })
  @IsOptional()
  empPhone: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  orgID?: bigint;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDefined()
  @IsEnum(UserType)
  employeeType: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  empJoinedDate?: Date | null;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  empExitDate?: Date | null;

  @ApiProperty({ required: false })
  @IsOptional()
  //   @IsDefined()
  @IsString()
  empPassword: string;

  @ApiProperty({ required: false })
  @IsOptional()
  domainName: string;
}
