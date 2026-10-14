import { Injectable, Logger } from '@nestjs/common';
// import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { ConfigService } from '@nestjs/config';
import { SNS } from 'aws-sdk';
import axios from 'axios';
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private snsClient: SNS;
  private apiUrl = 'https://api.aoc-portal.com/v1/sms/template';
  private apiKey = `${this.configService.get('SMS_CORDON_API_KEY')}`;
  constructor(private configService: ConfigService) {
    // Configure AWS SDK
    this.snsClient = new SNS({
      region: this.configService.get<string>('AWSREGION'),

      accessKeyId: this.configService.get<string>('AWSACCESSKEYID'),
      secretAccessKey: this.configService.get<string>('AWSSECRETACCESSKEY'),
    });
  }

  // async sendSms(phoneNumber: string, message: string): Promise<string> {
  //   const params = {
  //     Message: message,
  //     PhoneNumber: phoneNumber,
  //     MessageStructure: 'String',
  //     MessageAttributes: {
  //       'AWS.SNS.SMS.SenderID': {
  //         DataType: 'String',
  //         StringValue: 'Connect', // Optional: Your custom sender ID
  //       },
  //     },
  //   };

  //   try {
  //     const result = await this.snsClient.publish(params).promise();
  //     this.logger.log(`SMS sent successfully: ${JSON.stringify(result)}`);
  //     return 'SMS sent successfully';
  //   } catch (error) {
  //     this.logger.error(`Error sending SMS: ${error.message}`, error.stack);
  //     throw error;
  //   }
  // }

  async sendSms(
    phoneNumber: string,
    templateId: string,
    params: string[],
  ): Promise<string> {
    try {
      const payload = {
        sender: 'CORDON',
        to: phoneNumber,
        type: 'TRANS',
        templateId: templateId,
        custom: params,
      };

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          apikey: `${this.apiKey}`,
        },
      });
      // this.logger.log('SMS API Response:   >>>>>>>>>   ', response.data);
      return response.data;
      // return 'SMS sent successfully';
    } catch (error: any) {
      // this.logger.error(`Error sending SMS: ${error.message}`, error.stack);
      // throw error;
      this.logger.log(
        'SMS API Error: >>>>>>>>> ',
        error?.response?.data || error.message,
      );

      // Instead of throwing, return a fallback response
      return JSON.stringify({
        success: false,
        error: error?.response?.data || error.message,
      });
    }
  }
}
