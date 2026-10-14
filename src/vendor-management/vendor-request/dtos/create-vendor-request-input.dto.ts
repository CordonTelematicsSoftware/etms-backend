import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateVendorRequestInput {
  @ApiProperty({ required: false, default: null })
  @IsOptional()
  vendorID?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  orgID?: string;

  @ApiProperty({
    required: false,
    enum: ['pending', 'approved', 'cancelled', 'rejected', 'invited'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'cancelled', 'rejected', 'invited'])
  requestStatus: 'pending' | 'approved' | 'cancelled' | 'rejected' | 'invited';

  @ApiProperty({ required: false })
  @IsOptional()
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  reason: string;
}
