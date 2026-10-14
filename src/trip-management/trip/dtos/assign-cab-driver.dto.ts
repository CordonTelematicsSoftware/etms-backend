// assign-cab-driver.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignCabDriverDto {
  @ApiProperty({
    description: 'Trip ID to assign cab and driver to',
    example: '1462',
  })
  @IsNotEmpty({ message: 'Trip ID is required' })
  @IsString({ message: 'Trip ID must be a string' })
  tripID: string;

  @ApiProperty({
    description: 'Cab ID to assign',
    example: '6',
    required: false,
  })
  @IsOptional()
  @IsString()
  cabID?: string;

  @ApiProperty({
    description: 'Driver ID to assign',
    example: '5',
    required: false,
  })
  @IsOptional()
  @IsString()
  driverID?: string;

  @ApiProperty({
    description: 'Vendor ID',
    example: '9',
    required: false,
  })
  @IsOptional()
  @IsString()
  vendorID?: string;

  @ApiProperty({
    description: 'Vendor Code',
    example: 'A12',
    required: false,
  })
  @IsOptional()
  @IsString()
  vendorCode?: string;
}
