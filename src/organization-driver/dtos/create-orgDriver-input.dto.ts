import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequestStatus } from 'src/shared/enums';

export class DriverInput {
  @ApiProperty({ required: false, default: null })
  @IsOptional()
  orgID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  driverID?: bigint;

  @ApiProperty({
    required: false,
    enum: RequestStatus,
    default: RequestStatus.Pending,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(RequestStatus)
  status?: string;
}

export class CreateOrgDriverInput {
  @ApiProperty({ type: [DriverInput], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverInput)
  addedDrivers?: DriverInput[];

  @ApiProperty({ type: [DriverInput], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverInput)
  removedDrivers?: DriverInput[];
}
