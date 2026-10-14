import { ApiProperty } from 'node_modules/@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RateTripDto {
  @ApiProperty({
    description: 'Trip ID to be completed',
    example: '1805',
  })
  @IsString()
  tripID: string;

  // @ApiProperty()
  // @IsString()
  // empID: string;

  @ApiProperty({
    description: 'Rating from 1 to 5',
    example: 4,
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  ratings: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  comments?: string;
}
