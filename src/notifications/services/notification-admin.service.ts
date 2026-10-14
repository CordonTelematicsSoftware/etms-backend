import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  ChannelSettingDto,
  UpsertOrganizationNotificationSettingsDto,
} from '../dto/channel-setting.dto';
import {
  EventChannelConfigDto,
  UpsertOrganizationEventConfigDto,
} from '../dto/event-config.dto';
import { NotificationLogQueryDto } from '../dto/log-query.dto';
import {
  CreateNotificationTemplateDto,
  TemplateQueryDto,
  UpdateNotificationTemplateDto,
} from '../dto/notification-template.dto';
import { SendTestNotificationDto } from '../dto/send-test-notification.dto';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationEvents } from '../enums/notification-events.enum';
import { NotificationStatus } from '../enums/notification-status.enum';
import {
  NotificationLog,
  NotificationTemplate,
  OrganizationNotificationEventConfig,
  OrganizationNotificationSetting,
} from '../models';
import { assertProviderSupportsChannel } from '../utils/provider-channel.util';
import { Organization } from 'src/organization/models/organization.model';
import { EventLogService } from 'src/eventlog/eventlog.service';

export interface NotificationEventSummary {
  key: string;
  channels: NotificationChannel[];
}

const EVENT_ORG_OVERRIDES: Partial<Record<NotificationEvents, string>> = {
  [NotificationEvents.VENDOR_OTP_LOGIN]: '111',
  [NotificationEvents.DRIVER_OTP_LOGIN]: '000',
  [NotificationEvents.SUPER_ADMIN_OTP_LOGIN]: '333',
};

@Injectable()
export class NotificationAdminService {
  private readonly logger = new Logger(NotificationAdminService.name);

  constructor(
    @InjectModel(NotificationTemplate)
    private readonly templateModel: typeof NotificationTemplate,
    @InjectModel(OrganizationNotificationSetting)
    private readonly settingModel: typeof OrganizationNotificationSetting,
    @InjectModel(OrganizationNotificationEventConfig)
    private readonly eventConfigModel: typeof OrganizationNotificationEventConfig,
    @InjectModel(NotificationLog)
    private readonly logModel: typeof NotificationLog,
    private readonly eventlogService: EventLogService,
  ) {}

  async listEvents(): Promise<NotificationEventSummary[]> {
    // Event exists as long as at least one template row exists (active or inactive).
    // Events only disappear when ALL their templates are hard deleted — never on deactivation.
    const templates = await this.templateModel.findAll({
      attributes: ['event', 'channel'],
      order: [
        ['event', 'ASC'],
        ['channel', 'ASC'],
      ],
    });
    const byEvent = new Map<string, Set<NotificationChannel>>();

    for (const template of templates) {
      const channels =
        byEvent.get(template.event) ?? new Set<NotificationChannel>();
      channels.add(template.channel);
      byEvent.set(template.event, channels);
    }

    return [...byEvent.entries()].map(([key, channels]) => ({
      key,
      channels: [...channels],
    }));
  }

  async getOrganizationSettings(organizationId: string) {
    const [settings, eventConfigs] = await Promise.all([
      this.settingModel.findAll({
        where: { organizationId },
        order: [['channel', 'ASC']],
      }),
      this.eventConfigModel.findAll({
        where: { organizationId },
        include: [NotificationTemplate],
        order: [
          ['event', 'ASC'],
          ['priority', 'ASC'],
          ['channel', 'ASC'],
        ],
      }),
    ]);

    return { organizationId, settings, eventConfigs };
  }

  async upsertOrganizationSettings(
    organizationId: string,
    dto: UpsertOrganizationNotificationSettingsDto,
    actorId?: string,
  ) {
    const results: OrganizationNotificationSetting[] = [];
    // One diff row per (channel, field) that actually changed across the
    // whole batch — newly-created channels get OldValue: 'N/A' rather
    // than being silently omitted, same convention used for "created"
    // rows inside a diff table elsewhere in this app.
    const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};

    for (const setting of dto.settings) {
      this.validateChannelSetting(setting);
      const [record, created] = await this.settingModel.findOrCreate({
        where: { organizationId, channel: setting.channel },
        defaults: {
          organizationId,
          channel: setting.channel,
          enabled: setting.enabled,
          defaultProvider: setting.defaultProvider,
          providerConfig: setting.providerConfig ?? {},
          createdBy: actorId,
          updatedBy: actorId,
        },
      });

      if (created) {
        changeJSON[`${setting.channel} - enabled`] = {
          OldValue: 'N/A',
          newValue: setting.enabled,
        };
        changeJSON[`${setting.channel} - provider`] = {
          OldValue: 'N/A',
          newValue: setting.defaultProvider,
        };
      } else {
        // Captured before .update() mutates this same instance.
        const previousEnabled = record.enabled;
        const previousProvider = record.defaultProvider;

        await record.update({
          enabled: setting.enabled,
          defaultProvider: setting.defaultProvider,
          providerConfig: setting.providerConfig ?? {},
          updatedBy: actorId,
        });

        if (previousEnabled !== setting.enabled) {
          changeJSON[`${setting.channel} - enabled`] = {
            OldValue: previousEnabled,
            newValue: setting.enabled,
          };
        }
        if (previousProvider !== setting.defaultProvider) {
          changeJSON[`${setting.channel} - provider`] = {
            OldValue: previousProvider,
            newValue: setting.defaultProvider,
          };
        }
      }

      results.push(record);
    }

    if (Object.keys(changeJSON).length > 0) {
      // Scoped to the ORG BEING CONFIGURED (organizationId), not the
      // acting admin's own org — resolveLogScope() prefers liveUser.orgID,
      // so this makes the row correctly visible from that org's own
      // event-log view, not just the admin's.
      this.eventlogService
        .create({
          objectType: 'Notification Settings',
          changeType: 'bulk_edit',
          objectID: null,
          authID: actorId as any,
          updatedBy: 'Notification Admin',
          payload: {
            organizationId,
            channelsUpdated: dto.settings.map((s) => s.channel).join(', '),
          },
          requestPayload: JSON.parse(JSON.stringify(dto)),
          changeJSON,
          customDescription: `updated notification channel settings for org ${organizationId} (${dto.settings.length} channel(s))`,
          user: { id: actorId, orgID: organizationId },
        })
        .catch((err) =>
          this.logger.error(
            'Event log failed (upsertOrganizationSettings)',
            err,
          ),
        );
    }

    return results;
  }

  async listOrganizationEventConfigs(organizationId: string) {
    return this.eventConfigModel.findAll({
      where: { organizationId },
      include: [NotificationTemplate],
      order: [
        ['event', 'ASC'],
        ['priority', 'ASC'],
        ['channel', 'ASC'],
      ],
    });
  }

  async upsertOrganizationEventConfig(
    organizationId: string,
    event: string,
    dto: UpsertOrganizationEventConfigDto,
    actorId?: string,
  ) {
    const effectiveOrgId =
      EVENT_ORG_OVERRIDES[event as NotificationEvents] ?? organizationId;
    const results: OrganizationNotificationEventConfig[] = [];
    const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};

    for (const item of dto.channels) {
      await this.validateEventConfig(event, item);

      const [record, created] = await this.eventConfigModel.findOrCreate({
        where: { organizationId: effectiveOrgId, event, channel: item.channel },
        defaults: {
          organizationId: effectiveOrgId,
          event,
          channel: item.channel,
          enabled: item.enabled,
          provider: item.provider,
          templateId: item.templateId ?? null,
          priority: item.priority ?? 100,
          metadata: item.metadata ?? {},
          createdBy: actorId,
          updatedBy: actorId,
        },
      });

      if (created) {
        changeJSON[`${item.channel} - enabled`] = {
          OldValue: 'N/A',
          newValue: item.enabled,
        };
      } else {
        const previousEnabled = record.enabled;
        const previousProvider = record.provider;
        const previousTemplateId = record.templateId;

        await record.update({
          enabled: item.enabled,
          provider: item.provider,
          templateId: item.templateId ?? null,
          priority: item.priority ?? record.priority,
          metadata: item.metadata ?? {},
          updatedBy: actorId,
        });

        if (previousEnabled !== item.enabled) {
          changeJSON[`${item.channel} - enabled`] = {
            OldValue: previousEnabled,
            newValue: item.enabled,
          };
        }
        if (previousProvider !== item.provider) {
          changeJSON[`${item.channel} - provider`] = {
            OldValue: previousProvider,
            newValue: item.provider,
          };
        }
        if (String(previousTemplateId) !== String(item.templateId ?? null)) {
          changeJSON[`${item.channel} - templateId`] = {
            OldValue: previousTemplateId,
            newValue: item.templateId ?? null,
          };
        }
      }

      results.push(
        (await this.eventConfigModel.findByPk(record.id, {
          include: [NotificationTemplate],
        })) ?? record,
      );
    }

    if (Object.keys(changeJSON).length > 0) {
      this.eventlogService
        .create({
          objectType: 'Notification Event Routing',
          changeType: 'bulk_edit',
          objectID: null,
          authID: actorId as any,
          updatedBy: 'Notification Admin',
          payload: {
            organizationId: effectiveOrgId,
            event,
            channelsUpdated: dto.channels.map((c) => c.channel).join(', '),
          },
          requestPayload: JSON.parse(JSON.stringify(dto)),
          changeJSON,
          customDescription: `updated notification routing for event "${event}" (org ${effectiveOrgId})`,
          user: { id: actorId, orgID: effectiveOrgId },
        })
        .catch((err) =>
          this.logger.error(
            'Event log failed (upsertOrganizationEventConfig)',
            err,
          ),
        );
    }

    return results;
  }

  async listTemplates(query: TemplateQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.event) where.event = query.event;
    if (query.channel) where.channel = query.channel;
    if (query.locale) where.locale = query.locale;
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === true || query.isActive === 'true';
    }

    return this.templateModel.findAll({
      where,
      order: [
        ['event', 'ASC'],
        ['channel', 'ASC'],
        ['locale', 'ASC'],
        ['name', 'ASC'],
      ],
    });
  }

  async createTemplate(dto: CreateNotificationTemplateDto, actorId?: string) {
    const template = await this.templateModel.create({
      providerTemplateId: dto.providerTemplateId ?? null,
      code: dto.code,
      name: dto.name,
      event: dto.event,
      channel: dto.channel,
      locale: dto.locale ?? 'en',
      subject: dto.subject,
      body: dto.body,
      variables: dto.variables ?? {},
      metadata: dto.metadata ?? {},
      isActive: dto.isActive ?? true,
      createdBy: actorId,
      updatedBy: actorId,
    });

    // No orgID — templates are a global resource shared across orgs via
    // event-config references, not owned by any single org.
    this.eventlogService
      .create({
        objectType: 'Notification Template',
        changeType: 'add',
        objectID: template.id,
        authID: actorId as any,
        updatedBy: 'Notification Admin',
        payload: {
          templateID: template.id,
          code: template.code,
          name: template.name,
          event: template.event,
          channel: template.channel,
          locale: template.locale,
          isActive: template.isActive,
        },
        requestPayload: JSON.parse(JSON.stringify(dto)),
        customDescription: `created new Notification Template "${template.name}" (${template.event} / ${template.channel})`,
        user: { id: actorId },
      })
      .catch((err) =>
        this.logger.error('Event log failed (createTemplate)', err),
      );

    return template;
  }

  async getTemplate(id: string) {
    const template = await this.templateModel.findByPk(id);
    if (!template) {
      throw new NotFoundException('Notification template not found');
    }
    return template;
  }

  async updateTemplate(
    id: string,
    dto: UpdateNotificationTemplateDto,
    actorId?: string,
  ) {
    const template = await this.getTemplate(id);

    // Snapshot taken before .update() mutates this same instance in
    // place — without this there'd be nothing to diff against afterward.
    const previousValues: Record<string, any> = {
      providerTemplateId: template.providerTemplateId,
      name: template.name,
      event: template.event,
      channel: template.channel,
      locale: template.locale,
      subject: template.subject,
      body: template.body,
      isActive: template.isActive,
    };

    // Detect deactivation — if currently active and being set to false, cascade disable org event configs
    const isBeingDeactivated =
      template.isActive === true && dto.isActive === false;

    // Detect reactivation of system events — re-enable their org event config automatically
    const isBeingReactivated =
      template.isActive === false && dto.isActive === true;
    const isSystemEvent =
      template.event === NotificationEvents.VENDOR_OTP_LOGIN ||
      template.event === NotificationEvents.DRIVER_OTP_LOGIN;

    await template.update({
      providerTemplateId:
        dto.providerTemplateId === undefined
          ? template.providerTemplateId
          : dto.providerTemplateId,
      name: dto.name ?? template.name,
      event: dto.event ?? template.event,
      channel: dto.channel ?? template.channel,
      locale: dto.locale ?? template.locale,
      subject: dto.subject === undefined ? template.subject : dto.subject,
      body: dto.body ?? template.body,
      variables: dto.variables ?? template.variables,
      metadata: dto.metadata ?? template.metadata,
      isActive: dto.isActive ?? template.isActive,
      updatedBy: actorId,
    });

    if (isBeingDeactivated) {
      // Disable all org event configs that are currently enabled and using this template
      // Also clear templateId so OrgAdmin must reselect when template is re-enabled
      await this.eventConfigModel.update(
        { enabled: false, templateId: null, updatedBy: actorId },
        { where: { templateId: id, enabled: true } },
      );
    }

    if (isBeingReactivated && isSystemEvent) {
      // Auto re-enable the system org's event config and re-link the template
      const orgId = EVENT_ORG_OVERRIDES[template.event as NotificationEvents];
      if (orgId) {
        await this.eventConfigModel.update(
          { enabled: true, templateId: Number(id), updatedBy: actorId },
          {
            where: {
              organizationId: orgId,
              event: template.event,
              channel: template.channel,
            },
          },
        );
      }
    }

    const currentValues: Record<string, any> = {
      providerTemplateId: template.providerTemplateId,
      name: template.name,
      event: template.event,
      channel: template.channel,
      locale: template.locale,
      subject: template.subject,
      body: template.body,
      isActive: template.isActive,
    };
    const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
    for (const key of Object.keys(currentValues)) {
      if (previousValues[key] !== currentValues[key]) {
        changeJSON[key] = {
          OldValue: previousValues[key],
          newValue: currentValues[key],
        };
      }
    }

    this.eventlogService
      .create({
        objectType: 'Notification Template',
        changeType: 'edit',
        objectID: id,
        authID: actorId as any,
        updatedBy: 'Notification Admin',
        payload: { templateID: id, name: template.name },
        requestPayload: JSON.parse(JSON.stringify(dto)),
        changeJSON,
        customDescription: `updated Notification Template "${template.name}"`,
        user: { id: actorId },
      })
      .catch((err) =>
        this.logger.error('Event log failed (updateTemplate)', err),
      );

    return template;
  }

  async deactivateTemplate(id: string, actorId?: string) {
    const template = await this.getTemplate(id);
    const wasActive = template.isActive;
    await template.update({ isActive: false, updatedBy: actorId });

    // Disable all org event configs that are currently enabled and using this template
    // Also clear templateId so OrgAdmin must reselect when template is re-enabled
    const cascaded = await this.eventConfigModel.update(
      { enabled: false, templateId: null, updatedBy: actorId },
      { where: { templateId: id, enabled: true } },
    );
    const cascadedCount = cascaded?.[0] ?? 0;

    // changeType 'edit' (not 'delete') — this only flips isActive; the
    // row still exists and can be reactivated. hardDeleteTemplate below
    // is the real delete.
    this.eventlogService
      .create({
        objectType: 'Notification Template',
        changeType: 'edit',
        objectID: id,
        authID: actorId as any,
        updatedBy: 'Notification Admin',
        payload: {
          templateID: id,
          name: template.name,
          cascadedOrgEventConfigsDisabled: cascadedCount,
        },
        requestPayload: { id },
        changeJSON: {
          isActive: { OldValue: wasActive, newValue: false },
        },
        customDescription: `deactivated Notification Template "${template.name}"`,
        user: { id: actorId },
      })
      .catch((err) =>
        this.logger.error('Event log failed (deactivateTemplate)', err),
      );

    return template;
  }

  // Returns orgs that have an enabled event config referencing this template
  // Used by frontend to warn SuperAdmin before deactivating or deleting
  async getTemplateUsage(id: string) {
    await this.getTemplate(id);

    const configs = await this.eventConfigModel.findAll({
      where: { templateId: id, enabled: true },
      attributes: ['organizationId'],
    });

    const orgIds = [...new Set(configs.map((c) => c.organizationId))];
    if (orgIds.length === 0) return { orgs: [] };

    const orgs = await Organization.findAll({
      where: { id: orgIds },
      attributes: ['id', 'name'],
    });

    const orgNameMap = new Map(orgs.map((o) => [String(o.id), o.name]));

    return {
      orgs: orgIds.map((orgId) => ({
        organizationId: orgId,
        organizationName: orgNameMap.get(orgId) ?? orgId,
      })),
    };
  }

  async hardDeleteTemplate(id: string, actorId?: string) {
    const template = await this.getTemplate(id);
    const snapshot = {
      code: template.code,
      name: template.name,
      event: template.event,
      channel: template.channel,
    };

    const isSystemEvent =
      template.event === NotificationEvents.VENDOR_OTP_LOGIN ||
      template.event === NotificationEvents.DRIVER_OTP_LOGIN;

    if (isSystemEvent) {
      // Cascade delete for system events — remove event configs and channel
      // settings for the matching org+channel, then delete the template itself
      const orgId = EVENT_ORG_OVERRIDES[template.event as NotificationEvents];

      const destroyedConfigs = await this.eventConfigModel.destroy({
        where: { templateId: id },
      });

      let destroyedSettings = 0;
      if (orgId) {
        destroyedSettings = await this.settingModel.destroy({
          where: { organizationId: orgId, channel: template.channel },
        });
      }

      await template.destroy();

      this.eventlogService
        .create({
          objectType: 'Notification Template',
          changeType: 'delete',
          objectID: id,
          authID: actorId as any,
          updatedBy: 'Notification Admin',
          payload: {
            ...snapshot,
            cascadedEventConfigsDeleted: destroyedConfigs,
            cascadedSettingsDeleted: destroyedSettings,
          },
          requestPayload: { id },
          customDescription: `permanently deleted Notification Template "${snapshot.name}" (system event, cascaded)`,
          user: { id: actorId },
        })
        .catch((err) =>
          this.logger.error('Event log failed (hardDeleteTemplate)', err),
        );

      return { success: true, id };
    }

    // For all other events — block delete if any org event config references it
    // Use two separate queries to avoid varchar=bigint type mismatch on the JOIN
    const usageConfigs = await this.eventConfigModel.findAll({
      where: { templateId: id },
      attributes: ['organizationId'],
    });

    if (usageConfigs.length > 0) {
      const orgIds = [...new Set(usageConfigs.map((c) => c.organizationId))];

      const orgs = await Organization.findAll({
        where: { id: orgIds },
        attributes: ['id', 'name'],
      });

      const orgNameMap = new Map(orgs.map((o) => [String(o.id), o.name]));
      const orgNames = orgIds.map((oid) => orgNameMap.get(oid) ?? oid);

      // Not logged — deletion was blocked, nothing actually happened.
      throw new BadRequestException(
        `Template is currently in use by the following organization(s) and cannot be deleted: ${orgNames.join(
          ', ',
        )}. Remove it from their event configurations first.`,
      );
    }

    await template.destroy();

    this.eventlogService
      .create({
        objectType: 'Notification Template',
        changeType: 'delete',
        objectID: id,
        authID: actorId as any,
        updatedBy: 'Notification Admin',
        payload: snapshot,
        requestPayload: { id },
        customDescription: `permanently deleted Notification Template "${snapshot.name}"`,
        user: { id: actorId },
      })
      .catch((err) =>
        this.logger.error('Event log failed (hardDeleteTemplate)', err),
      );

    return { success: true, id };
  }

  // Fire-and-forget log for a test-notification send. Called from the
  // controller alongside dispatcher.notify() — logged regardless of
  // whether the actual test dispatch succeeds, since the audit value
  // here is "someone triggered a test", not the delivery outcome.
  logTestNotification(
    organizationId: string,
    dto: SendTestNotificationDto,
    actorId?: string,
  ): void {
    this.eventlogService
      .create({
        objectType: 'Notification Test',
        changeType: 'test',
        objectID: null,
        authID: actorId as any,
        updatedBy: 'Notification Admin',
        payload: {
          organizationId,
          event: dto.event,
          channels: Array.isArray(dto.channels)
            ? dto.channels.join(', ')
            : dto.channels,
          recipientEmail: (dto as any).recipient?.email,
          recipientPhone: (dto as any).recipient?.phoneNumber,
        },
        requestPayload: JSON.parse(JSON.stringify(dto)),
        customDescription: `sent a test notification for event "${dto.event}" to org ${organizationId}`,
        user: { id: actorId, orgID: organizationId },
      })
      .catch((err) =>
        this.logger.error('Event log failed (logTestNotification)', err),
      );
  }

  async listLogs(organizationId: string, query: NotificationLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where: Record<string, unknown> = { organizationId };

    if (query.event) {
      where.event = query.event;
    }

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.eventLogId) {
      where.eventLogId = query.eventLogId;
    }

    return this.logModel.findAndCountAll({
      where,
      include: [NotificationTemplate],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
  }

  async markStaleProcessingAsFailed(minutes: number) {
    const staleBefore = new Date(Date.now() - minutes * 60 * 1000);
    const [count] = await this.logModel.update(
      {
        status: NotificationStatus.FAILED,
        failedAt: new Date(),
        errorCode: 'STALE_PROCESSING',
        errorMessage: `Notification remained processing for more than ${minutes} minutes`,
      },
      {
        where: {
          status: NotificationStatus.PROCESSING,
          updatedAt: { [Op.lt]: staleBefore },
        },
      },
    );

    return { count };
  }

  private validateChannelSetting(setting: ChannelSettingDto): void {
    assertProviderSupportsChannel(setting.defaultProvider, setting.channel);
  }

  private async validateEventConfig(
    event: string,
    item: EventChannelConfigDto,
  ): Promise<void> {
    assertProviderSupportsChannel(item.provider, item.channel);

    if (item.enabled && !item.templateId) {
      throw new BadRequestException(
        `templateId is required when ${event}/${item.channel} is enabled`,
      );
    }

    if (!item.templateId) return;

    const template = await this.templateModel.findByPk(item.templateId);
    if (!template) {
      throw new BadRequestException(
        `Template with id ${item.templateId} does not exist`,
      );
    }

    if (template.event !== event) {
      throw new BadRequestException(
        'Template event does not match the configured event',
      );
    }

    if (template.channel !== item.channel) {
      throw new BadRequestException(
        'Template channel does not match the configured channel',
      );
    }

    if (!template.isActive && item.enabled) {
      throw new BadRequestException('Cannot enable an inactive template');
    }
  }
}
