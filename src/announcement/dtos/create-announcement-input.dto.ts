import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { Status } from 'src/shared/enums';

export class CreateAnnouncementInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate({ message: 'Please select a valid end date.' })
  @Transform(({ value }) => new Date(value))
  endDate: Date;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsEnum(Status)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  teamID?: string;
}
