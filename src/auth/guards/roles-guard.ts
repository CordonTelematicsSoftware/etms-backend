import {
  CanActivate,
  ExecutionContext,
  Injectable,
  // Logger,
} from '@nestjs/common';

import { UserType } from 'src/shared/enums';

@Injectable()
export class RolesGuard implements CanActivate {
  // private logger = new Logger(RolesGuard.name);
  constructor(private readonly permission: string) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const {
      user,
      // route: { path },
    } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }
    // this.logger.log('path', path, JSON.stringify(user), path?.split('/')?.[1]);
    if (user.userType === UserType.SuperAdmin) {
      return true;
    }
    if (user.permissions?.includes(this.permission)) {
      return true;
    }
    return false;
  }
}
