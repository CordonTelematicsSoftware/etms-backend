import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';

export class ChannelSettingDto {
  @ApiProperty({
    enum: NotificationChannel,
    example: NotificationChannel.EMAIL,
  })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    enum: NotificationProvider,
    example: NotificationProvider.EMAIL_NODEMAILER,
  })
  @IsEnum(NotificationProvider)
  defaultProvider: NotificationProvider;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { from: 'support@example.com', senderId: 'YourBrand' },
  })
  @IsOptional()
  @IsObject()
  providerConfig?: Record<string, unknown>;
}

export class UpsertOrganizationNotificationSettingsDto {
  @ApiProperty({ type: [ChannelSettingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelSettingDto)
  settings: ChannelSettingDto[];
}
