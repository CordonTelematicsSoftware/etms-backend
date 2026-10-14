import { Controller, Logger, Body, Post, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from 'node_modules/@nestjs/swagger';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { IVRCallingService } from '../service/ivr-calling.service';
import { IVRCallInput } from '../dtos/ivr-call.dto';
import { SafeHomeIVRResponseDto } from '../dtos/safeHome-ivr-response.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { CoPassengerCallInput } from '../dtos/copassenger-call.dto';

@Controller('ivr-call')
@ApiTags('IVR Call')
export class IVRCallingController {
  private logger = new Logger(IVRCallingController.name);
  constructor(private readonly ivrCallingService: IVRCallingService) {}

  @Post('/connect-employee-to-driver')
  @ApiBearerAuth('access-token')
  async connectEmployeeToDriver(
    @Body() ivrCallInput: IVRCallInput,
    @CurrentUser() user: any,
  ): Promise<any> {
    return await this.ivrCallingService.connectEmployeeToDriver(
      ivrCallInput,
      user,
    );
  }

  @Post('/connect-driver-to-employee')
  @ApiBearerAuth('access-token')
  async connectDriverToEmployee(
    @Body() ivrCallInput: IVRCallInput,
    @CurrentUser() user: any,
  ): Promise<any> {
    return await this.ivrCallingService.connectDriverToEmployee(
      ivrCallInput,
      user,
    );
  }

  @Post('/connect-employee-to-copassenger')
  @ApiBearerAuth('access-token')
  async connectEmployeeToCoPassenger(
    @Body() coPassengerCallInput: CoPassengerCallInput,
    @CurrentUser() user: any,
  ): Promise<any> {
    return await this.ivrCallingService.connectEmployeeToCoPassenger(
      coPassengerCallInput,
      user,
    );
  }

  @Public()
  @Post('safehome-prompt')
  async safeHomePrompt(@Body() dto: any) {
    return this.ivrCallingService.safeHomePromptDialplan(dto);
  }

  @Public()
  @Post('safehome-dtmf')
  async safeHomeDtmf(@Body() dto: any) {
    return this.ivrCallingService.safeHomeDtmfDialplan(dto);
  }

  @Get('/waitAndExecute')
  @ApiBearerAuth('access-token')
  async waitAndExecute(): Promise<any> {
    return await this.ivrCallingService.initiateSafeHomeIVR('8589885167');
  }

  //   @Get('/getDetails')
  //   @ApiBearerAuth('access-token')
  //   async getDetails(): Promise<any> {
  //     return await this.ivrCallingService.getCallDetails('DR4-D8-1782374836.1580331');
  //     //commented for testing
  //         // return await this.ivrCallingService.initiateSafeHomeIVR('8589885167');

  //   }

  @Post('/safehome-webhook')
  @Public()
  async markSafeHomeFromIVR(
    @Body() safeHomeIVRResponseDto: SafeHomeIVRResponseDto,
  ): Promise<any> {
    return await this.ivrCallingService.markSafeHomeFromIVR(
      safeHomeIVRResponseDto,
    );
  }

  @Post('/safehome-missedcall-webhook')
  @Public()
  async missedSafeHomeIVR(
    @Body() safeHomeIVRResponseDto: SafeHomeIVRResponseDto,
  ): Promise<any> {
    return await this.ivrCallingService.missedSafeHomeIVR(
      safeHomeIVRResponseDto,
    );
  }

  @Post('/call-status-webhook')
  @Public()
  async callStatusWebhook(@Body() payload: any): Promise<any> {
    await this.ivrCallingService.updateIVRCallStatus(payload);
    return {
      success: true,
    };
  }

  @Post('/connect-employee-to-helpdesk')
  @ApiBearerAuth('access-token')
  async connectEmployeeToHelpdesk(@CurrentUser() user: any): Promise<any> {
    return await this.ivrCallingService.connectEmployeeToHelpdesk(user);
  }
}
