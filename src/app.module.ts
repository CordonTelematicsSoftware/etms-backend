import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';
import { MailerModule } from '@nestjs-modules/mailer';
import { SequelizeModule } from '@nestjs/sequelize';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HeaderInterceptor } from './auth/interceptors/header-interceptors';
import { ProfilerMiddleware } from './shared/utils/interceptors/profiler-interceptor';
import { RoleModule } from './role/role.module';
import { LoggingInterceptor } from './logger/logger.intercepter';
import { SettingsModule } from './settings/service/settings.module';
import { SmsService } from './sms/services/sms.service';
import { SmsModule } from './sms/sms.module';
import { accessToken } from './shared/utils/google-auth-utils';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { readFileSync } from 'fs';
import { LoggerModule } from './logger/logger.module';
import { PasswordModule } from './password-management/password/password.module';
import { PasswordHistoryModule } from './password-management/password-history/password-history.module';
import { EmployeeModule } from './employee/employee.module';
import { ConfigurationModule } from './config-management/config/config.module';
import { CompanyConfigModule } from './config-management/company-config/company-config.module';
import { ProfileModule } from './profile/profile.module';
import { OrganizationModule } from './organization/organization.module';
import { CityModule } from './city/city.module';
import { ProcessModule } from './process/process.module';
import { TeamModule } from './team/team.module';
import { CostcenterModule } from './costcenter/costcenter.module';
import { VendorUserModule } from './vendor-management/vendor-user/vendor-user.module';
import { VendorModule } from './vendor-management/vendor/vendor.module';
import { VendorRoleModule } from './vendor-management/vendor-role/vendor-role.module';
import { VendorAccessModule } from './vendor-management/vendor-access/vendor-access.module';
import { LocationModule } from './location-management/locations/location.module';
import { CommonPointModule } from './location-management/commonPoints/commonPoint.module';
import { VendorRequestModule } from './vendor-management/vendor-request/vendor.module';
// import { VendorOrganizationModule } from './vendor-management/vendor-organization/vendor-org.module';
import { DriverModule } from './drivers/driver.module';
import { CabModule } from './cabs/cab.module';
import { BrandModule } from './brands/brand.module';
import { TripRequestModule } from './trip-management/trip-request/trip-request.module';
import { TripModule } from './trip-management/trip/trip.module';
import { OrganizationCabModule } from './organization-cab/organization-cab.module';
import { OrganizationDriverModule } from './organization-driver/organization-driver.module';
import { RouteModule } from './routes/route.module';
import { GoogleMapModule } from './google-maps/google-map-module';
import { BillingConfigurationModule } from './billing-module/billing-configuration.module';
import { SecurityModule } from './security/security.module';
import { IVRCallingModule } from './IVR-calling/ivr-calling.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { ReportModule } from './reports/report.module';
import { ReportExportModule } from './report-export/report-export.module';
import { AlertModule } from './alerts/alert.module';
import { ScheduleModule } from '@nestjs/schedule';
import { GrievanceModule } from './grievance/grievance.module';
import { GmsCategoryModule } from './gms-category/gms-category.module';
import { ApprovalRequestModule } from './approval-request/approval-request.module';
import { ReportSchedulerModule } from './report-scheduler/report-scheduler.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleReminderModule } from './schedule-reminder/schedule-reminder.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      envFilePath: [`.env`],
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'fonts'), // Serve static files from /var/task/fonts
      serveRoot: '/fonts', // Serve the fonts at the /fonts URL
    }),
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        dialect: 'postgres',
        host: config.get('PG_DB_HOST'),
        port: parseInt(<string>config.get('PG_DB_PORT'), 10) || 3306,
        username: config.get('PG_DB_USER'),
        password: config.get('PG_DB_PASS'),
        database: config.get('PG_DB_NAME'),
        autoLoadModels: true,
        minifyAliases: false,
        synchronize: false,
        logging: config.get('LOGGER_ENABLED') === 'true' ? true : false, // logging: true,
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000,
          evict: 10000,
        },
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: true,
            ca: readFileSync(
              join(__dirname, '..', 'certs', 'global-bundle.pem'),
            ),
          },
        },
      }),
    }),

    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        transport: {
          service: 'gmail',
          auth: {
            type: 'OAuth2',
            user: config.get('MAIL_OAUTH_USER'),
            clientId: config.get('MAIL_CLIENT_ID'),
            clientSecret: config.get('MAIL_CLIENT_SECRET'),
            refreshToken: config.get('MAIL_REFRESH_TOKEN'),
            accessToken: await accessToken(),
          },
        },
        defaults: {
          from: '"no-reply" <mail@techtaliya.com>',
        },
             
        template: {
          dir: process.cwd() + '/src/email/templates/',
          adapter: new EjsAdapter(), // or new PugAdapter()
          options: {
            strict: false,
          },
        },
      }),
    }),
    AuthModule,
    // AdministratorModule,
    // UserModule,
    CityModule,
    OrganizationModule,
    EmployeeModule,
    ProfileModule,
    RoleModule,
    SettingsModule,
    SmsModule,
    LoggerModule,
    ProcessModule,
    TeamModule,
    PasswordModule,
    PasswordHistoryModule,
    ConfigurationModule,
    CompanyConfigModule,
    ProcessModule,
    TeamModule,
    CostcenterModule,
    VendorModule,
    VendorUserModule,
    VendorRoleModule,
    VendorAccessModule,
    // VendorOrganizationModule,
    VendorRequestModule,
    LocationModule,
    CommonPointModule,
    DriverModule,
    CabModule,
    BrandModule,
    TripRequestModule,
    TripModule,
    OrganizationCabModule,
    OrganizationDriverModule,
    RouteModule,
    GoogleMapModule,
    BillingConfigurationModule,
    SecurityModule,
    IVRCallingModule,
    AnnouncementModule,
    ReportModule,
    ReportExportModule,
    AlertModule,
    GrievanceModule,
    GmsCategoryModule,
    ApprovalRequestModule,
    ReportSchedulerModule,
    NotificationsModule,
    ScheduleReminderModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HeaderInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    SmsService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ProfilerMiddleware).forRoutes('*');
  }
}
