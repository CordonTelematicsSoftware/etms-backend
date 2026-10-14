import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsOptional, IsString } from 'class-validator';

export class CreateVendorRoleInput {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({ required: true })
  @IsDefined()
  permissions: string[];

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorID?: string;

  @ApiProperty({ default: false })
  enabled: boolean;
}
