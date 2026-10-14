import { NotificationLog } from './notification-log.model';
import { NotificationTemplate } from './notification-template.model';
import { OrganizationNotificationEventConfig } from './organization-notification-event-config.model';
import { OrganizationNotificationSetting } from './organization-notification-setting.model';
import { Organization } from 'src/organization/models/organization.model';

export const NOTIFICATION_MODELS = [
  NotificationTemplate,
  OrganizationNotificationSetting,
  OrganizationNotificationEventConfig,
  NotificationLog,
  Organization,
];

export {
  NotificationLog,
  NotificationTemplate,
  OrganizationNotificationEventConfig,
  OrganizationNotificationSetting,
};
