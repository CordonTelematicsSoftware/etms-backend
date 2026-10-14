export interface NotificationUser {
  id?: string;
  email?: string;
  phoneNumber?: string;
  deviceToken?: string;
  snsEndpointArn?: string;
  locale?: string;
  firstName?: string;
  lastName?: string;
  [key: string]: unknown;
}
