import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import { NotificationStatus } from '../enums/notification-status.enum';
import {
  NotifyInput,
  NotifyResult,
} from '../interfaces/notification-dispatch.interface';
import { NotificationJob } from '../interfaces/notification-job.interface';
import {
  NotificationLog,
  NotificationTemplate,
  OrganizationNotificationEventConfig,
  OrganizationNotificationSetting,
} from '../models';
import { SqsNotificationQueueService } from '../queue/sqs-notification-queue.service';
import { toErrorDetails } from '../utils/object.util';
import { assertProviderSupportsChannel } from '../utils/provider-channel.util';
import { NotificationDeliveryService } from './notification-delivery.service';
import { redactSensitiveData } from 'src/shared/utils/redact-utils';

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    @InjectModel(NotificationLog)
    private readonly logModel: typeof NotificationLog,
    @InjectModel(OrganizationNotificationSetting)
    private readonly settingModel: typeof OrganizationNotificationSetting,
    @InjectModel(OrganizationNotificationEventConfig)
    private readonly eventConfigModel: typeof OrganizationNotificationEventConfig,
    private readonly delivery: NotificationDeliveryService,
    private readonly queue: SqsNotificationQueueService,
  ) {}

  async notify(input: NotifyInput): Promise<NotifyResult> {
    if (!input.organizationId || !input.event) {
      ``;
      throw new BadRequestException('organizationId and event are required');
    }
    this.logger.log('inside notification dispatcher');
    this.logger.log(redactSensitiveData(input));
    const [settings, configs] = await Promise.all([
      this.settingModel.findAll({
        where: { organizationId: input.organizationId, enabled: true },
      }),
      this.eventConfigModel.findAll({
        where: {
          organizationId: input.organizationId,
          event: input.event,
          enabled: true,
        },
        include: [NotificationTemplate],
        order: [
          ['priority', 'ASC'],
          ['channel', 'ASC'],
        ],
      }),
    ]);

    const organizationChannels = new Map(
      settings.map((item) => [item.channel, item]),
    );
    const requestedChannelConfigs = configs.filter((config) => {
      const isChannelEnabled = organizationChannels.has(config.channel);
      const isChannelConfigured =
        !input.channels || input.channels.includes(config.channel);
      return isChannelEnabled && isChannelConfigured;
    });

    if (requestedChannelConfigs.length === 0) {
      this.logger.debug(
        `Skipping ${input.organizationId}/${input.event}; no enabled notification configuration`,
      );
      return { logIds: [], queued: false };
    }

    const shouldQueue = input.queue ?? true;
    const queueAvailable = shouldQueue && this.queue.isConfigured();
    const logs: NotificationLog[] = [];
    const deliveredLogIds: string[] = [];
    const failedLogIds: string[] = [];

    for (const config of requestedChannelConfigs) {
      const setting = organizationChannels.get(config.channel);

      if (!setting) {
        continue;
      }

      assertProviderSupportsChannel(config.provider, config.channel);

      const organizationChannelConfig = {
        ...(setting.providerConfig ?? {}),
        ...config.get({ plain: true }),
      };
      const log = await this.logModel.create({
        organizationId: input.organizationId,
        event: input.event,
        channel: config.channel,
        provider: config.provider,
        status: queueAvailable
          ? NotificationStatus.QUEUED
          : NotificationStatus.PROCESSING,
        recipientUserId: input.recipient.id,
        recipientEmail: input.recipient.email,
        recipientPhone: input.recipient.phoneNumber,
        recipientDeviceToken: input.recipient.deviceToken,
        recipientSnsEndpointArn: input.recipient.snsEndpointArn,
        templateId: config.templateId,
        payload: {
          recipient: input.recipient,
          data: input.data ?? {},
          locale: input.locale ?? input.recipient.locale ?? 'en',
          organizationChannelConfig,
          metadata: config.metadata ?? {},
        },
        eventLogId: input.eventLogId,
        tripID: input?.tripID,
        empID: input?.empID,
      });

      logs.push(log);

      if (queueAvailable) {
        const job: NotificationJob = {
          id: randomUUID(),
          logId: log.id.toString(),
          organizationId: input.organizationId,
          event: input.event,
          eventLogId: input.eventLogId,
          createdAt: new Date().toISOString(),
        };
        try {
          const queued = await this.queue.enqueue(job);
          await log.update({ queuedMessageId: queued.messageId });
        } catch (error) {
          const details = toErrorDetails(error);
          await log.update({
            status: NotificationStatus.FAILED,
            errorCode: details.code,
            errorMessage: details.message,
            failedAt: new Date(),
          });
          failedLogIds.push(log.id.toString());
        }
      } else {
        try {
          await this.delivery.deliverLog(log.id.toString());
          deliveredLogIds.push(log.id.toString());
        } catch {
          failedLogIds.push(log.id.toString());
        }
      }
    }

    return {
      logIds: logs.map((log) => log.id.toString()),
      deliveredLogIds,
      failedLogIds,
      queued: queueAvailable,
    };
  }
}
