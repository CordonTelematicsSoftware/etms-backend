import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { NotificationJob } from '../interfaces/notification-job.interface';

@Injectable()
export class SqsNotificationQueueService {
  private readonly client: SQSClient;
  private readonly logger = new Logger(SqsNotificationQueueService.name);

  constructor() {
    this.client = new SQSClient({
      region: process.env.AWS_REGION ?? process.env.AWSREGION,
      credentials: this.credentialsFromEnv(),
    });
  }

  isConfigured(): boolean {
    return Boolean(process.env.NOTIFICATION_SQS_FIFO_URL);
  }

  async enqueue(job: NotificationJob): Promise<{ messageId?: string }> {
    const queueUrl = process.env.NOTIFICATION_SQS_FIFO_URL;
    try {
      if (!queueUrl) {
        throw new Error('SQS FIFO queueUrl is not configured');
      }

      const result = await this.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(job),
          MessageGroupId: this.messageGroupId(job),
          MessageDeduplicationId: job.id,
        }),
      );

      return { messageId: result.MessageId };
    } catch (error) {
      this.logger.error(error);
    }

    try {
      const result = await this.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(job),
          MessageGroupId: this.messageGroupId(job),
          MessageDeduplicationId: job.id,
        }),
      );
      return { messageId: result.MessageId };
    } catch (error) {
      this.logger.error(
        'Failed to enqueue notification job',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async receive(): Promise<Message[]> {
    const queueUrl = process.env.NOTIFICATION_SQS_FIFO_URL;

    if (!queueUrl) {
      return [];
    }

    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 2,
        VisibilityTimeout: 4,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );

    return result.Messages ?? [];
  }

  async delete(message: Message): Promise<void> {
    const queueUrl = process.env.NOTIFICATION_SQS_FIFO_URL;

    if (!queueUrl || !message.ReceiptHandle) {
      return;
    }

    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  }

  private messageGroupId(job: NotificationJob): string {
    const groupId = `${job.organizationId}-${job.event}-${job.logId}`;
    return groupId.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 128);
  }

  private credentialsFromEnv():
    | { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
    | undefined {
    const accessKeyId =
      process.env.AWS_ACCESS_KEY_ID ?? process.env.AWSACCESSKEYID;
    const secretAccessKey =
      process.env.AWS_SECRET_ACCESS_KEY ?? process.env.AWSSECRETACCESSKEY;

    if (!accessKeyId || !secretAccessKey) {
      return undefined;
    }

    return {
      accessKeyId,
      secretAccessKey,
      sessionToken:
        process.env.AWS_SESSION_TOKEN ?? process.env.AWSSESSIONTOKEN,
    };
  }
}
