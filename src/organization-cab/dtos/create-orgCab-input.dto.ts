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

export class CabInput {
  @ApiProperty({ required: false, default: null })
  @IsOptional()
  orgID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  cabID?: bigint;

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

export class CreateOrgCabInput {
  @ApiProperty({ type: [CabInput], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CabInput)
  addedCabs?: CabInput[];

  @ApiProperty({ type: [CabInput], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CabInput)
  removedCabs?: CabInput[];
}
