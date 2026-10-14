import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';
import { AocPortalSmsProvider } from './aoc-portal-sms.provider';
import { FirebasePushProvider } from './firebase-push.provider';
import { FirebasePushDriverProvider } from './firebase-push-driver.provider';
import { NodemailerEmailProvider } from './nodemailer-email.provider';
import { NotificationTransportProvider } from '../interfaces/notification-provider.interface';
import { SnsNotificationProvider } from './sns-notification.provider';

@Injectable()
export class NotificationProviders {
  private readonly providers: NotificationTransportProvider[];

  constructor(
    snsProvider: SnsNotificationProvider,
    aocPortalProvider: AocPortalSmsProvider,
    nodemailerProvider: NodemailerEmailProvider,
    firebaseProvider: FirebasePushProvider,
    firebaseDriverProvider: FirebasePushDriverProvider,
  ) {
    this.providers = [
      snsProvider,
      aocPortalProvider,
      nodemailerProvider,
      firebaseProvider,
      firebaseDriverProvider,
    ];
  }

  find(
    provider: NotificationProvider,
    channel: NotificationChannel,
  ): NotificationTransportProvider {
    const resolved = this.providers.find((item) =>
      item.canHandle(provider, channel),
    );

    if (!resolved) {
      throw new Error(
        `No notification provider registered for ${provider}/${channel}`,
      );
    }

    return resolved;
  }
}
