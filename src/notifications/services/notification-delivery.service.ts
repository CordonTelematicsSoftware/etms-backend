import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationUser } from '../interfaces/notification-user.interface';
import { NotificationLog, NotificationTemplate } from '../models';
import { NotificationProviders } from '../providers';
import { toErrorDetails } from '../utils/object.util';
import { NotificationTemplateRenderer } from './template-renderer.service';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { ConfigurationService } from 'src/config-management/config/services/config.service';

interface StoredNotificationPayload {
  recipient?: NotificationUser;
  data?: Record<string, unknown>;
  locale?: string;
  organizationChannelConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @InjectModel(NotificationLog)
    private readonly logModel: typeof NotificationLog,
    private readonly renderer: NotificationTemplateRenderer,
    private readonly providers: NotificationProviders,
    private configurationService: ConfigurationService,
  ) {}

  private getSmsSegmentCount(message: string): number {
    const length = message?.length ?? 0;

    if (length === 0) return 0;
    if (length <= 160) return 1;

    return 1 + Math.ceil((length - 160) / 153);
  }
  // Config format: "unitCount,costForUnitCount" e.g. "1,1.25" → ₹1.25 per SMS.
  // Best-effort: returns null on any config issue so a bad/missing config
  // never blocks or fails SMS delivery.
  private async calculateSmsCost(
    organizationId: string,
    smsCount: number,
  ): Promise<number | null> {
    if (!smsCount || smsCount <= 0) {
      return null;
    }

    try {
      const smsCostConfig = await this.configurationService.getConfigValue(
        'SMS_COST',
        BigInt(organizationId),
      );

      const [unitCount, costForUnitCount] = String(smsCostConfig ?? '')
        .split(',')
        .map(Number);

      if (
        !Number.isFinite(unitCount) ||
        unitCount <= 0 ||
        !Number.isFinite(costForUnitCount)
      ) {
        this.logger.warn(
          `SMS_COST is malformed for org ${organizationId} ("${smsCostConfig}") — persisting SMS without cost.`,
        );
        return null;
      }

      const costPerSms = costForUnitCount / unitCount;
      return Number((smsCount * costPerSms).toFixed(2));
    } catch (error: any) {
      this.logger.warn(
        `SMS_COST unavailable for org ${organizationId}: ${error?.message} — persisting SMS without cost.`,
      );
      return null;
    }
  }

  async deliverLog(logId: string): Promise<NotificationLog> {
    const log = await this.logModel.findByPk(logId, {
      include: [NotificationTemplate],
    });

    if (!log) {
      throw new NotFoundException(`Notification log ${logId} not found`);
    }

    if (log.status === NotificationStatus.SENT) {
      return log;
    }

    const payload = (log.payload ?? {}) as StoredNotificationPayload;
    const recipient = payload.recipient ?? {};
    const data = payload.data ?? {};
    const locale = payload.locale ?? 'en';

    try {
      if (!log.template) {
        throw new Error('Notification log is missing its configured template');
      }

      await log.update({
        status: NotificationStatus.PROCESSING,
        errorCode: null,
        errorMessage: null,
        failedAt: null,
      });

      const renderedTemplate = this.renderer.render(log.template, {
        organizationId: log.organizationId,
        event: log.event,
        recipient: recipient as Record<string, unknown>,
        data,
        locale,
        now: new Date().toISOString(),
      });

      await log.update({
        subject: renderedTemplate.subject,
        renderedBody: renderedTemplate.body,
        smsCount:
          log.channel === NotificationChannel.SMS
            ? this.getSmsSegmentCount(renderedTemplate.body)
            : null,
      });

      if (log.channel === NotificationChannel.SMS && log.smsCount) {
        const smsCost = await this.calculateSmsCost(
          log.organizationId,
          log.smsCount,
        );
        if (smsCost !== null) {
          await log.update({ smsCost });
        }
      }
      const provider = this.providers.find(log.provider, log.channel);
      const result = await provider.send({
        logId: log.id.toString(),
        organizationId: log.organizationId,
        event: log.event,
        channel: log.channel,
        provider: log.provider,
        recipient: recipient,
        message: renderedTemplate,
        data,
        providerConfig: payload.organizationChannelConfig ?? {},
        metadata: payload.metadata ?? {},
      });
      await log.update({
        status: NotificationStatus.SENT,
        providerMessageId: result.providerMessageId,
        providerResponse: result.response ?? {},
        sentAt: new Date(),
        failedAt: null,
      });

      return log.reload({ include: [NotificationTemplate] });
    } catch (error) {
      const details = toErrorDetails(error);
      await log.update({
        status: NotificationStatus.FAILED,
        errorCode: details.code,
        errorMessage: details.message,
        retryCount: log.retryCount + 1,
        failedAt: new Date(),
      });

      this.logger.error(
        `Notification delivery failed for log ${log.id}: ${details.message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
