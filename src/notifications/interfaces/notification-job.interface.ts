export interface NotificationJob {
  id: string;
  logId: string;
  organizationId: string;
  event: string;
  eventLogId?: string;
  createdAt: string;
}
