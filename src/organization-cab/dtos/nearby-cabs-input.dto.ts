import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class NearbyCabsInput {
  @ApiPropertyOptional({ description: 'Search radius in kilometers' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  radiusKm: number;

  // Optional — SuperAdmin/multi-org users may want to target a specific org.
  // Regular users fall back to their own orgID in the service.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgID?: string;
}
