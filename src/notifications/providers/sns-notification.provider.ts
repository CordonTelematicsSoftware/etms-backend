import { Injectable } from '@nestjs/common';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';
import {
  NotificationProviderSendInput,
  NotificationProviderSendResult,
  NotificationTransportProvider,
} from '../interfaces/notification-provider.interface';

@Injectable()
export class SnsNotificationProvider implements NotificationTransportProvider {
  private readonly client: SNSClient;

  constructor() {
    this.client = new SNSClient({
      region: process.env.AWS_REGION ?? process.env.AWSREGION,
      credentials: this.credentialsFromEnv(),
    });
  }

  canHandle(
    provider: NotificationProvider,
    channel: NotificationChannel,
  ): boolean {
    return (
      (provider === NotificationProvider.SMS_SNS &&
        channel === NotificationChannel.SMS) ||
      (provider === NotificationProvider.EMAIL_SNS &&
        channel === NotificationChannel.EMAIL) ||
      (provider === NotificationProvider.PUSH_SNS &&
        channel === NotificationChannel.PUSH)
    );
  }

  async send(
    input: NotificationProviderSendInput,
  ): Promise<NotificationProviderSendResult> {
    if (input.provider === NotificationProvider.SMS_SNS) {
      return this.sendSms(input);
    }

    if (input.provider === NotificationProvider.EMAIL_SNS) {
      return this.sendEmailTopic(input);
    }

    return this.sendPush(input);
  }

  private async sendSms(
    input: NotificationProviderSendInput,
  ): Promise<NotificationProviderSendResult> {
    if (!input.recipient.phoneNumber) {
      throw new Error('SMS recipient is missing phoneNumber');
    }

    const senderId = this.asString(
      input.providerConfig.senderId,
      process.env.NOTIFICATION_SNS_SMS_SENDER_ID,
    );
    const smsType =
      this.asString(
        input.providerConfig.smsType,
        process.env.NOTIFICATION_SNS_SMS_TYPE,
        'Transactional',
      ) ?? 'Transactional';

    const messageAttributes: Record<
      string,
      { DataType: string; StringValue: string }
    > = {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: smsType,
      },
    };

    if (senderId) {
      messageAttributes['AWS.SNS.SMS.SenderID'] = {
        DataType: 'String',
        StringValue: senderId,
      };
    }

    const result = await this.client.send(
      new PublishCommand({
        PhoneNumber: input.recipient.phoneNumber,
        Message: input.message.body,
        MessageAttributes: messageAttributes,
      }),
    );

    return {
      providerMessageId: result.MessageId,
      response: {
        messageId: result.MessageId,
        sequenceNumber: result.SequenceNumber,
      },
    };
  }

  private async sendEmailTopic(
    input: NotificationProviderSendInput,
  ): Promise<NotificationProviderSendResult> {
    const topicArn = this.asString(
      input.providerConfig.topicArn,
      process.env.NOTIFICATION_SNS_EMAIL_TOPIC_ARN,
    );
    const targetArn = this.asString(
      input.providerConfig.targetArn,
      input.recipient.snsEndpointArn,
    );

    if (!topicArn && !targetArn) {
      throw new Error(
        'SNS email delivery requires providerConfig.topicArn or targetArn',
      );
    }

    const result = await this.client.send(
      new PublishCommand({
        TopicArn: topicArn,
        TargetArn: targetArn,
        Subject: input.message.subject ?? input.event,
        Message: input.message.body,
        MessageAttributes: {
          event: { DataType: 'String', StringValue: input.event },
          organizationId: {
            DataType: 'String',
            StringValue: input.organizationId,
          },
        },
      }),
    );

    return {
      providerMessageId: result.MessageId,
      response: {
        messageId: result.MessageId,
        sequenceNumber: result.SequenceNumber,
      },
    };
  }

  private async sendPush(
    input: NotificationProviderSendInput,
  ): Promise<NotificationProviderSendResult> {
    const topicArn = this.asString(
      input.providerConfig.topicArn,
      process.env.NOTIFICATION_SNS_PUSH_TOPIC_ARN,
    );
    const targetArn = this.asString(
      input.providerConfig.targetArn,
      input.recipient.snsEndpointArn,
    );

    if (!topicArn && !targetArn) {
      throw new Error(
        'SNS push delivery requires recipient.snsEndpointArn or providerConfig.topicArn',
      );
    }

    const title = input.message.subject ?? input.event;
    const message = JSON.stringify({
      default: input.message.body,
      GCM: JSON.stringify({
        notification: {
          title,
          body: input.message.body,
        },
        data: input.data,
      }),
      APNS: JSON.stringify({
        aps: {
          alert: {
            title,
            body: input.message.body,
          },
        },
        data: input.data,
      }),
    });

    const result = await this.client.send(
      new PublishCommand({
        TopicArn: topicArn,
        TargetArn: targetArn,
        Message: message,
        MessageStructure: 'json',
      }),
    );

    return {
      providerMessageId: result.MessageId,
      response: {
        messageId: result.MessageId,
        sequenceNumber: result.SequenceNumber,
      },
    };
  }

  private asString(...values: unknown[]): string | undefined {
    const value = values.find(
      (item) => typeof item === 'string' && item.length > 0,
    );
    return value as string | undefined;
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
