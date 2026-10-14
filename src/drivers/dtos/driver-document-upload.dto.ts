import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DriverDocumentUploadInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Document file to upload',
  })
  file?: any;
}
