import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GlobalExceptionsFilter } from './shared/utils/global-exception-handler';
import { SecurityHeadersMiddleware } from './shared/middleware/security-headers.middleware';
import basicAuth = require('express-basic-auth');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    ['/api-docs', '/api-docs-json'],
    basicAuth({
      challenge: true,
      users: {
        [process.env.SWAGGER_USER]: process.env.SWAGGER_PASSWORD,
      },
    }),
  );

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  app.use(
    new SecurityHeadersMiddleware().use.bind(new SecurityHeadersMiddleware()),
  );
  // app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  // app.useGlobalInterceptors(
  //   new HeaderInterceptor(app.get(JsonWebTokenService), app.get(AuthService)),
  // );

  app.useGlobalFilters(
    new GlobalExceptionsFilter((res, code, data) => res.send(data)),
  );
  app.enableCors({
    allowedHeaders: '*',
    // origin: '*',
    origin: [
      //TODO: Uncomment the below 3 line to to run the backend locally.
        'http://localhost:3000',
        'http://localhost:3001',
      //   'http://localhost:3002',
      'https://admin-uat.smartrouter.in',
      'https://vendor-uat.smartrouter.in',
      'https://employee-uat.smartrouter.in',
      //   'http://etms-employee-app-aut.s3-website.ap-south-1.amazonaws.com',
      //   'http://etms-vendor-app-aut.s3-website.ap-south-1.amazonaws.com',
      'https://admin.smartrouter.in',
      'https://vendor.smartrouter.in',
      'https://employee.smartrouter.in',
    ],
    credentials: true,
    exposedHeaders: 'token',
  });

  // app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist: true,
      // forbidNonWhitelisted: true,
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
  //  FIX 2: Only enable Swagger in non-production environments
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    //Disable Swagger in Production
    const options = new DocumentBuilder()
      .setTitle('Connect1103 API')
      .setDescription('Nestjs Backend API for Connect1103')
      .setVersion('1.0')
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
  }
  const host = '0.0.0.0';
  // const port = process.env.PORT || 7000;
   const port = process.env.PORT;
  await app.listen(port, host, (err?: any) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.log(err);
    }
  });
  // eslint-disable-next-line no-console
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
