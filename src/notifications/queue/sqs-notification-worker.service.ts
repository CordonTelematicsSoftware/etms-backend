import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Message } from '@aws-sdk/client-sqs';
import { NotificationJob } from '../interfaces/notification-job.interface';
import { NotificationDeliveryService } from '../services/notification-delivery.service';
import { SqsNotificationQueueService } from './sqs-notification-queue.service';

@Injectable()
export class SqsNotificationWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SqsNotificationWorkerService.name);
  private stopped = true;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly queue: SqsNotificationQueueService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  onModuleInit(): void {
    if (this.queue.isConfigured()) {
      this.stopped = false;
      this.schedule(0);
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  async pollOnce(): Promise<void> {
    const messages = await this.queue.receive();

    // for (const message of messages) {
    //   await this.handleMessage(message);
    // }
    await Promise.all(messages.map((message) => this.handleMessage(message)));
  }

  private schedule(delay: number): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        await this.pollOnce();
      } catch (error) {
        if (this.isCredentialsError(error)) {
          this.stopped = true;
          this.logger.warn(
            'SQS notification worker stopped because AWS credentials are not available. Configure the standard AWS credential chain or remove NOTIFICATION_SQS_FIFO_URL when SQS is not used.',
          );
          return;
        }

        this.logger.error(
          `SQS notification polling failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      } finally {
        this.schedule(1000);
      }
    }, delay);

    this.timer.unref?.();
  }

  private async handleMessage(message: Message): Promise<void> {
    if (!message.Body) {
      await this.queue.delete(message);
      return;
    }

    let job: NotificationJob;

    try {
      job = JSON.parse(message.Body) as NotificationJob;
    } catch (error) {
      this.logger.error(
        `Discarding malformed notification SQS message: ${message.MessageId}`,
      );
      await this.queue.delete(message);
      return;
    }

    try {
      await this.delivery.deliverLog(job.logId);
      await this.queue.delete(message);
    } catch (error) {
      const receiveCount =
        message.Attributes?.ApproximateReceiveCount ?? 'unknown';
      this.logger.warn(
        `Notification job ${job.id} failed on receive count ${receiveCount}; SQS redrive policy will decide retry/DLQ`,
      );
    }
  }

  private isCredentialsError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return (
      error.name === 'CredentialsProviderError' ||
      error.message.includes('Could not load credentials')
    );
  }
}
