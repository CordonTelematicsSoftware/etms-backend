import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NotificationChannel } from '../enums/notification-channel.enum';

export class CreateNotificationTemplateDto {
  @ApiPropertyOptional({ example: 'twilio-template-id', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  providerTemplateId?: string | null;

  @ApiProperty({ example: 'password_reset_sms_en', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  code: string;

  @ApiProperty({ example: 'Password Reset SMS', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'password.reset', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  event: string;

  @ApiProperty({ enum: NotificationChannel, example: NotificationChannel.SMS })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiPropertyOptional({ example: 'en', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @ApiPropertyOptional({ example: 'Reset your password' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({
    example:
      'Your password reset code is {{data.otp}}. It expires in {{data.expiresInMinutes}} minutes.',
  })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { data: ['otp', 'expiresInMinutes'] },
  })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateNotificationTemplateDto {
  @ApiPropertyOptional({ example: 'twilio-template-id', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  providerTemplateId?: string | null;

  @ApiPropertyOptional({ example: 'Password Reset SMS', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: 'password.reset', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  event?: string;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ example: 'en', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @ApiPropertyOptional({ nullable: true, example: 'Reset your password' })
  @IsOptional()
  @IsString()
  subject?: string | null;

  @ApiPropertyOptional({
    example: 'Your password reset code is {{data.otp}}.',
  })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TemplateQueryDto {
  @ApiPropertyOptional({ example: 'password.reset' })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: string | boolean;
}
