import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationUser } from '../interfaces/notification-user.interface';

class NotificationUserDto implements NotificationUser {
  [key: string]: unknown;

  @ApiPropertyOptional({ example: 'user-1' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: 'person@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'firebase-device-token' })
  @IsOptional()
  @IsString()
  deviceToken?: string;

  @ApiPropertyOptional({
    example: 'arn:aws:sns:ap-south-1:123456789012:endpoint/GCM/app/token',
  })
  @IsOptional()
  @IsString()
  snsEndpointArn?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class SendTestNotificationDto {
  @ApiProperty({ example: 'password.reset' })
  @IsString()
  event: string;

  @ApiProperty({ type: NotificationUserDto })
  @ValidateNested()
  @Type(() => NotificationUserDto)
  recipient: NotificationUserDto;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { otp: '123456', expiresInMinutes: 10 },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({
    enum: NotificationChannel,
    isArray: true,
    example: [NotificationChannel.SMS],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ example: 'event-log-123' })
  @IsOptional()
  @IsString()
  eventLogId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  queue?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tripID?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  empID?: string;
}
