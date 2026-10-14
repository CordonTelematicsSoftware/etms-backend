import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigurationService } from '../services/config.service';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('okta/config')
@ApiTags('Config')
export class OktaConfigController {
  constructor(private readonly configService: ConfigurationService) {}

  @Public()
  @Get('check-okta')
  async checkOkta(@Query('domain') domain: string): Promise<any> {
    return this.configService.getByDomain(domain);
  }
}
