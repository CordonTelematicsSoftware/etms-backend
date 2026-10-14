/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { tap } from 'rxjs';
import { JsonWebTokenService } from '../../shared/utils/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SessionService } from '../services/session.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HeaderInterceptor implements NestInterceptor {
  private logger = new Logger(HeaderInterceptor.name);
  constructor(
    private jsonWebTokenService: JsonWebTokenService,
    private sessionService: SessionService,
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<any> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    let newToken, token;
    if (!isPublic) {
      const request = context.switchToHttp().getRequest();
      const {
        headers: { authorization },
      } = request;
      if (authorization) {
        token = authorization?.split?.(' ')?.[1];
        const { exp, id, userType } =
          await this.jsonWebTokenService.verifyToken(token);
        if (exp) {
          const currentTimeStamp = Math.floor(
            new Date().getTime() / 1000,
          ).toFixed(0);
          if (exp - Number(currentTimeStamp) < 1800) {
            newToken = await this.sessionService.updateToken(
              token,
              id,
              userType,
            );
            this.logger.log('Token refreshed');
            request.newToken = newToken;
          }
        } else if (this.configService.get('ROTATE_LEGACY_TOKENS') === 'true') {
          // Pre-expiry session: no `exp` claim, so it would never rotate and
          // never expire. Swap it for an expiring token on this request.
          // Flag-gated: this fires for every session live at deploy, and a
          // client that ignores the `token` response header would log its
          // users out. Enable only once every client is confirmed to read it.
          this.logger.log('Legacy session token without exp; rotating');
          newToken = await this.sessionService.updateToken(token, id, userType);
          request.newToken = newToken;
        } else {
          this.logger.log('Session token');
        }
        // Handlers that re-read the bearer token from the request (e.g.
        // organization switching) look the session up by token string. After a
        // rotation the header value is stale and would match zero rows, so
        // point it at the token now actually stored.
        if (newToken && newToken !== token) {
          request.headers.authorization = `Bearer ${newToken}`;
        }
      }
    }

    const sendToken = () => {
      const res = context.switchToHttp().getResponse();
      if (!res.headersSent) {
        const tokenToSend =
          context.switchToHttp().getRequest().newToken || token;
        if (tokenToSend) {
          res.header('token', tokenToSend);
        }
      }
    };

    return next.handle().pipe(
      // `tap(fn)` registers a next-handler only. The rotation above has already
      // been committed to the DB, so if the handler throws we must still emit
      // the new token or the client is left holding one that no longer exists.
      tap({ next: sendToken, error: sendToken }),
    );
  }
}
