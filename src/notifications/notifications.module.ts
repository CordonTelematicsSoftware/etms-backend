import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { NOTIFICATION_MODELS } from './models';
import {
  NotificationTemplatesController,
  OrganizationNotificationsController,
} from './controllers/notification-admin.controller';
import { AocPortalSmsProvider } from './providers/aoc-portal-sms.provider';
import { FirebasePushProvider } from './providers/firebase-push.provider';
import { NodemailerEmailProvider } from './providers/nodemailer-email.provider';
import { NotificationProviders } from './providers';
import { SnsNotificationProvider } from './providers/sns-notification.provider';
import { SqsNotificationQueueService } from './queue/sqs-notification-queue.service';
import { SqsNotificationWorkerService } from './queue/sqs-notification-worker.service';
import { NotificationAdminService } from './services/notification-admin.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { NotificationDispatcherService } from './services/notification-dispatcher.service';
import { NotificationTemplateRenderer } from './services/template-renderer.service';
import { ConfigurationModule } from 'src/config-management/config/config.module';
import { FirebasePushDriverProvider } from './providers/firebase-push-driver.provider';
import { SecretsManagerService } from 'src/shared/secrets/secrets-manager.service';
import * as admin from 'firebase-admin';
import {
  FIREBASE_DRIVER_APP,
  FIREBASE_EMPLOYEE_APP,
} from './providers/notifications.tokens';

@Module({
  imports: [
    SequelizeModule.forFeature(NOTIFICATION_MODELS),
    ConfigurationModule,
  ],
  controllers: [
    NotificationTemplatesController,
    OrganizationNotificationsController,
  ],
  providers: [
    NotificationTemplateRenderer,
    NotificationAdminService,
    NotificationDeliveryService,
    NotificationDispatcherService,
    SqsNotificationQueueService,
    SqsNotificationWorkerService,
    SnsNotificationProvider,
    AocPortalSmsProvider,
    NodemailerEmailProvider,
    // FirebasePushProvider,
    // FirebasePushDriverProvider,
    NotificationProviders,
    SecretsManagerService,
    {
      provide: FIREBASE_EMPLOYEE_APP,
      useFactory: async (secrets: SecretsManagerService) => {
        const appName = process.env.FIREBASE_APP_NAME;
        const existing = admin.apps.find((a) => a?.name === appName);
        if (existing) return existing;

        const serviceAccount = await secrets.getJsonSecret(
          process.env.FIREBASE_SECRET_NAME,
        );

        return admin.initializeApp(
          {
            credential: admin.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID,
          },
          appName,
        );
      },
      inject: [SecretsManagerService],
    },
    {
      provide: FIREBASE_DRIVER_APP,
      useFactory: async (secrets: SecretsManagerService) => {
        const appName = process.env.FIREBASE_DRIVER_APP_NAME;
        const existing = admin.apps.find((a) => a?.name === appName);
        if (existing) return existing;

        const serviceAccount = await secrets.getJsonSecret(
          process.env.FIREBASE_DRIVER_SECRET_NAME,
        );

        return admin.initializeApp(
          {
            credential: admin.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_DRIVER_PROJECT_ID,
          },
          appName,
        );
      },
      inject: [SecretsManagerService],
    },
    FirebasePushProvider,
    FirebasePushDriverProvider,
  ],
  exports: [
    NotificationAdminService,
    NotificationDispatcherService,
    NotificationDeliveryService,
  ],
})
export class NotificationsModule {}
