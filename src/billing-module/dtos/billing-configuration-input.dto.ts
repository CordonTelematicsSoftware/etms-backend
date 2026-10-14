import { IsString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BillingConfigurationInput {
  @ApiProperty({ required: true })
  @IsString()
  vendorID: string;

  @ApiProperty({ required: false })
  @IsArray()
  billingRates?: [];
}
