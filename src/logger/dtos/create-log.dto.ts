import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsOptional, IsString } from 'class-validator';

export class AuthenticatedUserDto {
  @ApiProperty()
  @IsDefined()
  id: bigint;

  @ApiProperty()
  @IsDefined()
  @IsString()
  employeeID: string;

  @ApiProperty()
  @IsDefined()
  @IsString()
  empName: string;

  @ApiProperty()
  @IsDefined()
  @IsString()
  email: string;

  @ApiProperty()
  @IsDefined()
  @IsString()
  status: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  type: string;
}

export class RequestDto {
  @ApiProperty()
  @IsDefined()
  @IsString()
  method: string;

  @ApiProperty()
  @IsDefined()
  body: any;

  @ApiProperty()
  @IsDefined()
  headers: any;

  @ApiProperty()
  @IsOptional()
  user: AuthenticatedUserDto;

  @ApiProperty()
  @IsDefined()
  @IsString()
  url: string;
}

export class CreateLogDto {
  @ApiProperty()
  @IsDefined()
  request: RequestDto;

  @ApiProperty()
  @IsDefined()
  response: any;

  @ApiProperty()
  @IsDefined()
  @IsString()
  connection: any;

  @ApiProperty()
  @IsOptional()
  user: AuthenticatedUserDto;
}
