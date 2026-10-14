import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Callback, Context, Handler } from 'aws-lambda';
import { AppModule } from './app.module';
import { GlobalExceptionsFilter } from './shared/utils/global-exception-handler';
import { configure as serverlessExpress } from '@vendia/serverless-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

let server: Handler;

async function bootstrap(): Promise<Handler> {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    allowedHeaders: '*',
    origin: '*',
    credentials: true,
    exposedHeaders: 'token',
  });

  app.useGlobalFilters(
    new GlobalExceptionsFilter((res, code, data) => res.send(data)),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: (errors) => {
        const errorObj = {};
        errors.forEach((error) => {
          errorObj[error.property] =
            error.constraints[Object.keys(error.constraints)[0]];
          // message: error.constraints[Object.keys(error.constraints)[0]],
        });
        throw new BadRequestException(errorObj);
      },
      stopAtFirstError: true,
    }),
  );

  const options = new DocumentBuilder()
    .setTitle('ETMS API')
    .setDescription('Nestjs Backend API for ETMS')
    .setVersion('1.0')
    .addServer(`/prod`)
    .addBearerAuth(
      {
        // I was also testing it without prefix 'Bearer ' before the JWT
        description: `[just text field] Please enter token in following format: Bearer <JWT>`,
        name: 'Authorization',
        bearerFormat: 'Bearer', // I`ve tested not to use this field, but the result was the same
        scheme: 'Bearer',
        type: 'http', // I`ve attempted type: 'apiKey' too
        in: 'Header',
      },
      'access-token', // This name here is important for matching up with @ApiBearerAuth() in your controller!
    )
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      filter: true, // Enables search bar filtering
      showRequestDuration: true,
    },
  });
  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  server = server ?? (await bootstrap());
  // eslint-disable-next-line no-console
  console.log(event);
  return server(event, context, callback);
};
