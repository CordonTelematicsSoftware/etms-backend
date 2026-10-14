/* eslint-disable no-console */
import {
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
export class GlobalExceptionsFilter extends BaseExceptionFilter {
  private logger = new Logger(GlobalExceptionsFilter.name);
  constructor(
    private sendResponse: (res: any, status: HttpStatus, data: any) => void,
  ) {
    super();
  }

  catch(exception: any, host: ArgumentsHost) {
    this.logger.error('INSIDE GLOBAL EXCEPTION HANDLER');
    console.error(exception);
    console.log('------------------exception-----------', exception.data);
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (exception.status as HttpStatus) || HttpStatus.INTERNAL_SERVER_ERROR;
    this.logger.error(status);
    const message =
      status === HttpStatus.FORBIDDEN
        ? exception.message || "You don't have permission to do this"
        : exception instanceof HttpException
        ? exception.message
        : 'Something went wrong';

    let data =
      exception?.response?.data ??
      exception?.response ??
      'Something went wrong';
    let isValidationError = status === HttpStatus.BAD_REQUEST ? true : false;
    if (status === HttpStatus.FORBIDDEN) {
      data = { message: "You don't have permission to do this" };
      isValidationError = false;
    } else if (status === HttpStatus.UNAUTHORIZED) {
      data = { message: 'You are not authorized to do this' };
      isValidationError = false;
    } else if (exception.response === undefined) {
      // const unhandledException = formatUnhandledExceptions(exception);
      data = { message: exception.message || 'Something went wrong' };
      isValidationError = false;
    }
    // const statusCode = isValidationError ? HttpStatus.BAD_REQUEST : status;
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      isValidationError,
      errors: data, //{phoneNumber: "Must be unique"}
    });
  }
}
