import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private logger = new Logger(JwtAuthGuard.name);
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // const {
    //   headers: { authorization },
    // } = context.switchToHttp().getRequest();
    // let token;
    // if (authorization) {
    //   token = authorization?.split(' ')[1];
    // }
    if (isPublic) {
      this.logger.log('Public API');
      return true;
    }
    return super.canActivate(context);
  }
}
