import { Injectable } from '@nestjs/common';
import { sendMessageToSingleDevice } from './shared/utils/notification-utils';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  async testNotification(): Promise<boolean> {
    const deviceToken =
      'eJ6bpbjLQKGexb5ovx5Dl8:APA91bGzb5yrqHnz4yJcZgmuV9f4NbV5zjG4kCdCp5LFoqKaep9PoGLW8yNzYQDrGTeMkJsuWUst8PqdjGK4YNqaRaGNmG4GSsN17q2iYTykWwiUdCXPKnCSB2aqCNpY6z2SubI8zXfk';
    const message = {
      notification: {
        title: 'test',
        body: { name: 'Jerry' },
      },
    };
    await sendMessageToSingleDevice(deviceToken, message);
    return true;
  }
}
