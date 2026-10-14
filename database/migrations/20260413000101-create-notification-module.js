'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ================================
    // ENUM TYPES (shared)
    // ================================
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_notification_channel') THEN
          CREATE TYPE "enum_notification_channel" AS ENUM ('email', 'sms', 'push');
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_notification_provider') THEN
          CREATE TYPE "enum_notification_provider" AS ENUM (
            'sms_sns',
            'email_sns',
            'push_sns',
            'push_firebase',
            'sms_aoc_portal',
            'email_nodemailer'
          );
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_notification_status') THEN
          CREATE TYPE "enum_notification_status" AS ENUM (
            'queued',
            'processing',
            'sent',
            'failed'
          );
        END IF;
      END $$;
    `);

    // ================================
    // notification_templates
    // ================================
    await queryInterface.createTable('NotificationTemplates', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      providerTemplateId: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },

      code: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      event: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      channel: {
        type: 'enum_notification_channel',
        allowNull: false,
      },

      locale: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'en',
      },

      subject: Sequelize.TEXT,

      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      variables: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      createdBy: Sequelize.STRING(150),
      updatedBy: Sequelize.STRING(150),

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // UNIQUE CONTAINTS (code + locale)
    await queryInterface.addConstraint('NotificationTemplates', {
      fields: ['code', 'locale'],
      type: 'unique',
      name: 'uq_notification_templates_code_locale',
    });

    // ADD INDEX
    await queryInterface.addIndex('NotificationTemplates', [
      'event',
      'channel',
      'locale',
      'isActive',
    ]);

    // ================================
    // organization_notification_settings
    // ================================
    await queryInterface.createTable('OrganizationNotificationSettings', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      organizationId: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      channel: {
        type: 'enum_notification_channel',
        allowNull: false,
      },

      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      defaultProvider: {
        type: 'enum_notification_provider',
        allowNull: false,
      },

      providerConfig: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      createdBy: Sequelize.STRING(150),
      updatedBy: Sequelize.STRING(150),

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // UNIQUE CONTAINTS (organizationId + channel)
    await queryInterface.addConstraint('OrganizationNotificationSettings', {
      fields: ['organizationId', 'channel'],
      type: 'unique',
      name: 'uq_org_channel',
    });

    // ================================
    // organization_notification_event_configs
    // ================================
    await queryInterface.createTable('OrganizationNotificationEventConfigs', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      organizationId: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      event: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      channel: {
        type: 'enum_notification_channel',
        allowNull: false,
      },

      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      provider: {
        type: 'enum_notification_provider',
        allowNull: false,
      },

      templateId: {
        type: Sequelize.BIGINT,
        references: {
          model: 'NotificationTemplates',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },

      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 100,
      },

      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      createdBy: Sequelize.STRING(150),
      updatedBy: Sequelize.STRING(150),

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // UNIQUE CONSTRAINT (organizationId + event + channel)
    await queryInterface.addConstraint(
      'OrganizationNotificationEventConfigs',
      {
        fields: ['organizationId', 'event', 'channel'],
        type: 'unique',
        name: 'uq_org_event_channel',
      },
    );

    // ADD INDEX
    await queryInterface.addIndex(
      'OrganizationNotificationEventConfigs',
      ['templateId'],
    );

    await queryInterface.addIndex(
      'OrganizationNotificationEventConfigs',
      ['organizationId', 'event', 'enabled'],
    );

    // ================================
    // notification_logs
    // ================================
    await queryInterface.createTable('NotificationLogs', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      organizationId: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      event: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      channel: {
        type: 'enum_notification_channel',
        allowNull: false,
      },

      provider: {
        type: 'enum_notification_provider',
        allowNull: false,
      },

      status: {
        type: 'enum_notification_status',
        allowNull: false,
        defaultValue: 'queued',
      },

      recipientUserId: Sequelize.STRING(100),
      recipientEmail: Sequelize.STRING(320),
      recipientPhone: Sequelize.STRING(50),
      recipientDeviceToken: Sequelize.TEXT,
      recipientSnsEndpointArn: Sequelize.TEXT,

      templateId: {
        type: Sequelize.BIGINT,
        references: {
          model: 'NotificationTemplates',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },

      subject: Sequelize.TEXT,
      renderedBody: Sequelize.TEXT,

      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      providerResponse: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      providerMessageId: Sequelize.STRING(255),
      errorCode: Sequelize.STRING(150),
      errorMessage: Sequelize.TEXT,
      queuedMessageId: Sequelize.STRING(255),
      eventLogId: Sequelize.STRING(150),

      retryCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      sentAt: Sequelize.DATE,
      failedAt: Sequelize.DATE,

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // ADD INDEXES
    await queryInterface.addIndex('NotificationLogs', [
      'organizationId',
      'event',
      'createdAt',
    ]);

    await queryInterface.addIndex('NotificationLogs', [
      'status',
      'createdAt',
    ]);

    await queryInterface.addIndex('NotificationLogs', ['eventLogId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('NotificationLogs');
    await queryInterface.dropTable('OrganizationNotificationEventConfigs');
    await queryInterface.dropTable('OrganizationNotificationSettings');
    await queryInterface.dropTable('NotificationTemplates');

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_notification_status";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_notification_provider";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_notification_channel";',
    );
  },
};