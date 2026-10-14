import { ApiTags } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { Controller, Get, Query, Res } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';

@ApiTags('Auth')
@Controller('okta')
export class OktaAuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('/login')
  @Public()
  async oktaCallback(
    @Query('domain') domain: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    return this.authService.oktaLogin(domain, code, state, res);
  }
}
