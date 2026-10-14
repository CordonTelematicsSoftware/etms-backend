import { BadRequestException } from '@nestjs/common';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';

const PROVIDERS_BY_CHANNEL: Record<
  NotificationChannel,
  NotificationProvider[]
> = {
  [NotificationChannel.EMAIL]: [
    NotificationProvider.EMAIL_NODEMAILER,
    NotificationProvider.EMAIL_SNS,
  ],
  [NotificationChannel.SMS]: [
    NotificationProvider.SMS_SNS,
    NotificationProvider.SMS_AOC_PORTAL,
  ],
  [NotificationChannel.PUSH]: [
    NotificationProvider.PUSH_FIREBASE,
    NotificationProvider.PUSH_FIREBASE_DRIVER,
    NotificationProvider.PUSH_SNS,
  ],
};

export function providerSupportsChannel(
  provider: NotificationProvider,
  channel: NotificationChannel,
): boolean {
  return PROVIDERS_BY_CHANNEL[channel].includes(provider);
}

export function assertProviderSupportsChannel(
  provider: NotificationProvider,
  channel: NotificationChannel,
): void {
  if (!providerSupportsChannel(provider, channel)) {
    throw new BadRequestException(
      `${provider} cannot be used for ${channel} notifications`,
    );
  }
}

export function getDefaultProviderForChannel(
  channel: NotificationChannel,
): NotificationProvider {
  return PROVIDERS_BY_CHANNEL[channel][0];
}
