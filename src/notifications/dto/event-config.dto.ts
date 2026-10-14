import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';

export class EventChannelConfigDto {
  @ApiProperty({ enum: NotificationChannel, example: NotificationChannel.SMS })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    enum: NotificationProvider,
    example: NotificationProvider.SMS_SNS,
  })
  @IsEnum(NotificationProvider)
  provider: NotificationProvider;

  @ApiPropertyOptional({
    example: 1,
    description: 'Template ID (BIGINT)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null ? String(value) : undefined,
  )
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { senderId: 'YourBrand' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpsertOrganizationEventConfigDto {
  @ApiProperty({ type: [EventChannelConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventChannelConfigDto)
  channels: EventChannelConfigDto[];
}
