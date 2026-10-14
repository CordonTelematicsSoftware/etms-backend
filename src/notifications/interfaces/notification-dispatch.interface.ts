import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationUser } from './notification-user.interface';

export interface NotifyInput<
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  organizationId: string;
  event: string;
  recipient: NotificationUser;
  data?: TData;
  channels?: NotificationChannel[];
  locale?: string;
  eventLogId?: string;
  queue?: boolean;
  tripID?: string;
  empID?: string;
}

export interface NotifyResult {
  logIds: string[];
  deliveredLogIds?: string[];
  failedLogIds?: string[];
  queued: boolean;
}
