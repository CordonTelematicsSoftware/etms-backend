// assign-cab-driver.dto.ts
import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchTripFilterDto {
  @ApiProperty()
  @IsOptional()
  type: string;

  @ApiProperty()
  @IsOptional()
  cabID?: string;

  @ApiProperty()
  @IsOptional()
  driverID?: string;

  @ApiProperty()
  @IsOptional()
  vendorID?: string;

  @ApiProperty()
  @IsOptional()
  orgID?: string;

  @ApiProperty()
  @IsOptional()
  employeeID?: string;

  @ApiProperty()
  @IsOptional()
  tripID?: string;
}
