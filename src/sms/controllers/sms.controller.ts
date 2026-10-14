import { Controller, Post, Body } from '@nestjs/common';
import { SmsService } from '../services/sms.service';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('sms')
@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Public()
  @Post()
  async sendSms(
    @Body('phoneNumber') phoneNumber: string,
    // @Body('message') message: string,
    @Body('templateId') templateId: string,
    @Body('otp') otp: string[],
  ): Promise<void> {
    await this.smsService.sendSms(phoneNumber, templateId, otp);
  }
}
