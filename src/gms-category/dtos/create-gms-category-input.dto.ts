import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDefined, IsOptional, IsString } from 'class-validator';

export class CreateGmsCategoryInput {
  @ApiProperty({ required: true })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsDefined()
  @IsString()
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  attachmentRequired: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  notificationOn: boolean;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  alertEmails?: string[];
}
