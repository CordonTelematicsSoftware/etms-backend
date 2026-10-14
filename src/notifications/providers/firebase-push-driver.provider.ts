import { Inject, Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
// import { readFileSync } from 'fs';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';
import { stringifyFirebaseData } from '../utils/object.util';
import {
  NotificationProviderSendInput,
  NotificationProviderSendResult,
  NotificationTransportProvider,
} from '../interfaces/notification-provider.interface';
import { FIREBASE_DRIVER_APP } from './notifications.tokens';

@Injectable()
export class FirebasePushDriverProvider
  implements NotificationTransportProvider
{
  constructor(
    @Inject(FIREBASE_DRIVER_APP) private readonly app: admin.app.App,
  ) {}

  canHandle(
    provider: NotificationProvider,
    channel: NotificationChannel,
  ): boolean {
    return (
      provider === NotificationProvider.PUSH_FIREBASE_DRIVER &&
      channel === NotificationChannel.PUSH
    );
  }

  async send(
    input: NotificationProviderSendInput,
  ): Promise<NotificationProviderSendResult> {
    if (!input.recipient.deviceToken) {
      throw new Error('Push recipient is missing deviceToken');
    }

    const messageId = await admin.messaging(this.app).send({
      token: input.recipient.deviceToken,
      notification: {
        title: input.message.subject ?? input.event,
        body: input.message.body,
      },
      data: stringifyFirebaseData({
        ...input.data,
        event: input.event,
        organizationId: input.organizationId,
        notificationLogId: input.logId,
      }),
    });

    return {
      providerMessageId: messageId,
      response: { messageId },
    };
  }
}
// @Injectable()
// export class FirebasePushDriverProvider
//   implements NotificationTransportProvider
// {
//   private readonly app: admin.app.App;

//   constructor() {
//     const appName = process.env.FIREBASE_DRIVER_APP_NAME;
//     const existingApp = admin.apps.find((app) => app?.name === appName);

//     if (existingApp) {
//       this.app = existingApp;
//       return;
//     }

//     const serviceAccountPath = process.env.FIREBASE_DRIVER_SERVICE_ACCOUNT_PATH;
//     const serviceAccount = serviceAccountPath
//       ? JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
//       : undefined;

//     this.app = admin.initializeApp(
//       {
//         credential: serviceAccount
//           ? admin.credential.cert(serviceAccount as admin.ServiceAccount)
//           : admin.credential.applicationDefault(),
//         projectId: process.env.FIREBASE_DRIVER_PROJECT_ID,
//       },
//       appName,
//     );
//   }

//   canHandle(
//     provider: NotificationProvider,
//     channel: NotificationChannel,
//   ): boolean {
//     return (
//       provider === NotificationProvider.PUSH_FIREBASE_DRIVER &&
//       channel === NotificationChannel.PUSH
//     );
//   }

//   async send(
//     input: NotificationProviderSendInput,
//   ): Promise<NotificationProviderSendResult> {
//     if (!input.recipient.deviceToken) {
//       throw new Error('Push recipient is missing deviceToken');
//     }

//     const messageId = await admin.messaging(this.app).send({
//       token: input.recipient.deviceToken,
//       notification: {
//         title: input.message.subject ?? input.event,
//         body: input.message.body,
//       },
//       data: stringifyFirebaseData({
//         ...input.data,
//         event: input.event,
//         organizationId: input.organizationId,
//         notificationLogId: input.logId,
//       }),
//     });

//     return {
//       providerMessageId: messageId,
//       response: { messageId },
//     };
//   }
// }
