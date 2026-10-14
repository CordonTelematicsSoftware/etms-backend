import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { UserService } from '../services/user.service';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('')
@ApiTags('User')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiBearerAuth('access-token')
  @Post('member/token')
  async saveUsertoken(
    @CurrentUser() user: any,
    @Body() deviceToken: string,
  ): Promise<GenericResponse<null>> {
    return this.userService.saveUsertoken(user, deviceToken);
  }
}
