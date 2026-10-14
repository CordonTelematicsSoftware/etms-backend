import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsOptional } from 'class-validator';

export class MailObjectInput {
  @ApiProperty({ required: true })
  @IsDefined()
  mailTo: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  cc?: string[];

  @ApiProperty({ required: true })
  @IsDefined()
  subject: string;

  @ApiProperty({ required: true })
  @IsDefined()
  templateName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  mailBody: any;

  @ApiProperty({ required: false })
  @IsOptional()
  isAttachments: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  attachments: any;
}
