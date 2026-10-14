import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';
import { stripHtml } from '../utils/object.util';
import {
  NotificationProviderSendInput,
  NotificationProviderSendResult,
  NotificationTransportProvider,
} from '../interfaces/notification-provider.interface';

@Injectable()
export class NodemailerEmailProvider implements NotificationTransportProvider {
  constructor(private readonly mailerService: MailerService) {}

  canHandle(
    provider: NotificationProvider,
    channel: NotificationChannel,
  ): boolean {
    return (
      provider === NotificationProvider.EMAIL_NODEMAILER &&
      channel === NotificationChannel.EMAIL
    );
  }

  async send(
    input: NotificationProviderSendInput,
  ): Promise<NotificationProviderSendResult> {
    if (!input.recipient.email) {
      throw new Error('Email recipient is missing email');
    }

    const isHtml = input.providerConfig.html !== false;

    const result = await this.mailerService.sendMail({
      to: input.recipient.email,
      subject: input.message.subject ?? input.event,
      html: isHtml ? input.message.body : undefined,
      text: isHtml ? stripHtml(input.message.body) : input.message.body,
      headers: {
        'X-Notification-Event': input.event,
        'X-Notification-Organization': input.organizationId,
        'X-Notification-Log-Id': input.logId,
      },
    });

    return {
      providerMessageId: result.messageId,
      response: result,
    };
  }

  private asString(...values: unknown[]): string | undefined {
    const value = values.find(
      (item) => typeof item === 'string' && item.length > 0,
    );
    return value as string | undefined;
  }
}
