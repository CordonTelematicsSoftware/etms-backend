import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddEmpByDriverOtpInputDto {
  @ApiProperty({
    description: 'Trip ID',
    example: '1805',
  })
  @IsNotEmpty()
  @IsString()
  tripID: string;

  @ApiProperty({
    description: 'Employee Code',
  })
  @IsNotEmpty()
  @IsString()
  employeeCode: string;
}

export class AddEmpByDriverInputDto {
  @ApiProperty({
    description: 'Trip ID',
    example: '1805',
  })
  @IsNotEmpty()
  @IsString()
  tripID: string;

  @ApiProperty({
    description: 'Employee Code',
  })
  @IsNotEmpty()
  @IsString()
  employeeCode: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  otp: string;
}
