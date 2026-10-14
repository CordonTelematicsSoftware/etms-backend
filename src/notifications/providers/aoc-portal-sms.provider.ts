/* eslint-disable no-console, no-unused-vars */
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';
import {
  NotificationProviderSendInput,
  NotificationProviderSendResult,
  NotificationTransportProvider,
} from '../interfaces/notification-provider.interface';

@Injectable()
export class AocPortalSmsProvider implements NotificationTransportProvider {
  canHandle(
    provider: NotificationProvider,
    channel: NotificationChannel,
  ): boolean {
    return (
      provider === NotificationProvider.SMS_AOC_PORTAL &&
      channel === NotificationChannel.SMS
    );
  }

  async send(
    input: NotificationProviderSendInput,
  ): Promise<NotificationProviderSendResult> {
    const url = this.asString(
      input.providerConfig.url,
      process.env.AOC_PORTAL_SMS_URL,
    );
    const apiKey = this.asString(
      input.providerConfig.apiKey,
      process.env.AOC_PORTAL_API_KEY,
    );
    const senderId = this.asString(
      input.providerConfig.senderId,
      process.env.AOC_PORTAL_SENDER_ID,
    );

    if (!url) {
      throw new Error('AOC Portal SMS provider requires a URL');
    }

    if (!input.recipient.phoneNumber) {
      throw new Error('SMS recipient is missing phoneNumber');
    }

    const variableValues = Object.entries(
      (input.providerConfig?.template as any)?.variables,
    ).flatMap(([parentKey, keys]: any) =>
      keys?.map((key: any) => input[parentKey]?.[key]),
    );

    const payload = {
      sender: senderId || 'CORDON',
      to: input.recipient.phoneNumber,
      type: 'TRANS',
      templateId: String(
        (input.providerConfig?.template as any)?.providerTemplateId,
      ),
      custom: variableValues.map((value) => String(value)),
    };
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
      });

      const data = response.data as Record<string, unknown>;
      return {
        providerMessageId: this.asString(
          data.id,
          data.messageId,
          data.referenceId,
        ),
        response: {
          status: response.status,
          data,
        },
      };
    } catch (error: any) {
      console.error(
        '[AOC SMS] Provider send failed:',
        error.response?.data ?? error.message,
      );
      throw error;
    }
  }

  private asString(...values: unknown[]): string | undefined {
    const value = values.find(
      (item) => typeof item === 'string' && item.length > 0,
    );
    return value as string | undefined;
  }
}
