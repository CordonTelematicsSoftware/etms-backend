import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';
import { NotificationUser } from './notification-user.interface';

export interface RenderedMessage {
  subject?: string | null;
  body: string;
}

export interface NotificationProviderSendInput {
  logId: string;
  organizationId: string;
  event: string;
  channel: NotificationChannel;
  provider: NotificationProvider;
  recipient: NotificationUser;
  message: RenderedMessage;
  data: Record<string, unknown>;
  providerConfig: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface NotificationProviderSendResult {
  providerMessageId?: string;
  response?: Record<string, unknown>;
}

export interface NotificationTransportProvider {
  canHandle(
    provider: NotificationProvider,
    channel: NotificationChannel,
  ): boolean;
  send(
    input: NotificationProviderSendInput,
  ): Promise<NotificationProviderSendResult>;
}
