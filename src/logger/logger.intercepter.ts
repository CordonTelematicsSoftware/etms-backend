import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  forwardRef,
  // Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoggerService } from './logger.service';
import { redactSensitiveData } from 'src/shared/utils/redact-utils';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  // private logger = new Logger(LoggingInterceptor.name);
  constructor(
    @Inject(forwardRef(() => LoggerService))
    private loggerService: LoggerService,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // this.logger.log('############## LoggingInterceptor ###############');
    const req = context?.switchToHttp()?.getRequest();
    const {
      method,
      body,
      headers,
      connection,
      user,
      route: { path },
    } = req;
    const request = {
      method: <string>method,
      body,
      headers,
      user,
      url: path,
    };

    return next.handle().pipe(
      tap(async (response) => {
        if (method !== 'GET') {
          await this.loggerService.create({
            request: redactSensitiveData(request),
            response: redactSensitiveData(response),
            connection,
            user: redactSensitiveData(user),
          });
        }
      }),
    );
  }
}
