import {
  BadRequestException,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AuthenticationUserInput } from '../dtos/authentication-input.dto';
import { Op, Transaction } from 'sequelize';
import * as bcrypt from 'bcryptjs';
import { InjectModel } from '@nestjs/sequelize';
import { DriverAuthentication } from '../models/driver-auth.model';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { PasswordService } from 'src/password-management/password/services/password.service';
import { Status, UserType } from 'src/shared/enums';
import { compare } from 'bcryptjs';
import { Response } from 'express';
import { JsonWebTokenService } from 'src/shared/utils/jwt';
import { ConfigService } from '@nestjs/config';
import { SessionService } from './session.service';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { CreateDriverInput } from 'src/drivers/dtos/create-driver-input.dto';
import { Driver } from 'src/drivers/models/driver.model';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { Dict, handleErrors } from 'src/shared/utils/format-exception';
import { generateHashedOtp, generateOTP } from 'src/shared/utils/otp.utils';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import axios from 'axios';
import { SmsService } from 'src/sms/services/sms.service';
import {
  DriverLoginInput,
  DriverOtpVerificationInput,
} from '../dtos/driver-login-input.dto';
import { OtpVerificationInput } from '../dtos/login-input.dto';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { DriverDeviceInfo } from '../models/driver-device-model';
import { NotificationDispatcherService } from 'src/notifications/services/notification-dispatcher.service';
import { NotificationChannel } from 'src/notifications/enums/notification-channel.enum';

export class DriverAuthService {
  private logger = new Logger(DriverAuthService.name);
  constructor(
    @Inject(SessionService)
    private sessionService: SessionService,
    @InjectModel(DriverAuthentication)
    private driverAuthModel: typeof DriverAuthentication,
    @InjectModel(Driver)
    private driverModel: typeof Driver,
    @InjectModel(DriverDeviceInfo)
    private driverDeviceInfoModel: typeof DriverDeviceInfo,
    // @InjectModel(Vendor)
    // private vendorModel: typeof Vendor,
    private passwordService: PasswordService,
    private configService: ConfigService,
    private jsonWebTokenService: JsonWebTokenService,
    private eventlogService: EventLogService,
    private smsService: SmsService,
    private configurationService: ConfigurationService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  async register(
    createDriverInput: CreateDriverInput,
    // user?: any,
  ): Promise<GenericResponse<Driver>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.driverModel,
        ['email', 'phone'],
        createDriverInput,
      );
      handleErrors(validationErrors, 'unique');
      const driver = await this.driverModel.create({
        ...createDriverInput,
        // vendorID: user?.vendorID,
      });
      const eventPayload = JSON.parse(JSON.stringify(createDriverInput));
      const eventLog = {
        objectType: 'Driver',
        changeType: 'add',
        objectID: driver.id,
        authID: null,
        orgID: '',
        updatedBy: '',
        payload: driver,
        requestPayload: eventPayload,
        user: driver,
      };
      this.eventlogService.create(eventLog);
      const authInput = {
        phone: createDriverInput?.phone,
        email: createDriverInput?.email,
        userType: UserType.Driver,
        status: Status.Active,
        password: createDriverInput?.password ?? null,
        passwordCreatedAt: createDriverInput?.password ? new Date() : null,
        driverID: driver.id,
        name: createDriverInput?.name,
      };
      await this.driverAuthModel.create(authInput);
      return {
        message: 'Driver created successfully',
        data: driver,
      };
    } catch (error) {
      throw error;
    }
  }

  async create(
    createAuthInput: AuthenticationUserInput,
    transaction?: Transaction,
  ): Promise<DriverAuthentication> {
    try {
      const hashedPassword = createAuthInput.password
        ? await this.generateHashedPassword(createAuthInput.password)
        : null;
      const userInput = { ...createAuthInput, hashedPassword };
      const user = await this.driverAuthModel.create(userInput, {
        transaction,
      });

      Object.assign(userInput, {
        userID: user?.id.toString(),
      });

      return user;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async generateHashedPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return await bcrypt.hash(password, salt);
  }

  async login(
    loginInput: DriverLoginInput,
    res: Response,
    // endPonit: string,
  ): Promise<GenericResponse<any>> {
    try {
      const { email, phone, password } = loginInput;
      const conditions = [];
      if (email) conditions.push({ email: email });
      if (phone) conditions.push({ phone: phone });
      const authUser: any = await this.driverAuthModel.findOne({
        where: {
          [Op.or]: conditions,
        },
        attributes: [
          'id',
          'hashedOtp',
          'otpCreatedAt',
          'hashedPassword',
          'passwordCreatedAt',
          'email',
          'phone',
          'userType',
          'employeeID',
          'failedLoginAttempts',
          'status',
          'name',
          'driverID',
        ],
      });
      if (!authUser) {
        throw new BadRequestException(
          'Incorrect login details. Check your username and password.',
        );
      }
      //   else if (
      //     authUser.userType === UserType.SuperAdmin &&
      //     endPonit !== EndPoint.Admin
      //   ) {
      //     throw new BadRequestException(
      //       'Invalid login details. Check your username and password.',
      //     );
      //   }
      //   if (
      //     authUser.userType === UserType.Employee &&
      //     endPonit === EndPoint.Employee
      //   ) {
      //     if (
      //       authUser.employee.employeeType === UserType.Admin &&
      //       endPonit === EndPoint.Employee
      //     ) {
      //       throw new BadRequestException(
      //         'Invalid login details. Check your username and password.',
      //       );
      //     }
      //   } else if (
      //     authUser.userType === UserType.Employee &&
      //     endPonit === EndPoint.Admin
      //   ) {
      //     if (authUser.employee.employeeType !== UserType.Admin) {
      //       throw new BadRequestException(
      //         'Invalid login details. Check your username and password.',
      //       );
      //     }
      //   }
      const failedUserLoginAttempts =
        (await this.passwordService.getConfigValue('FAILED_LOGIN_ATTEMPTS')) ??
        5;
      if (
        authUser.status === Status.Inactive
        //  || authUser.employee?.organization?.status === Status.Inactive
      ) {
        throw new BadRequestException(
          'Your account has been deactivated. Please contact Your admin.',
        );
      }
      if (authUser.failedLoginAttempts > failedUserLoginAttempts) {
        await this.driverAuthModel.update(
          { status: Status.Inactive },
          {
            where: { id: authUser.id.toString() },
            returning: true,
          },
        );
        throw new BadRequestException(
          'Out of login attempts. Please contact Your admin.',
        );
      }

      if (authUser?.hashedPassword) {
        if (!(await compare(password, authUser?.hashedPassword))) {
          await this.driverAuthModel.update(
            { failedLoginAttempts: authUser.failedLoginAttempts + 1 },
            {
              where: { id: authUser.id.toString() },
              returning: true,
            },
          );
          throw new BadRequestException(
            'Incorrect login details. Check your username and password.',
          );
        }
      } else {
        throw new BadRequestException(
          'Incorrect login details. Check your username and password.',
        );
      }
      //   if (authUser.userType !== UserType.SuperAdmin) {
      //     try {
      //       const result = await this.passwordService.checkPasswordExists(
      //         authUser?.employeeID,
      //         authUser?.passwordCreatedAt,
      //       );
      //       if (result) {
      //         await this.generateResetPasswordLinkAndSendMail(
      //           authUser?.id?.toString(),
      //           {
      //             ...authUser,
      //             email: authUser?.email,
      //           },
      //           authUser.userType,
      //           'reset-password',
      //           authUser?.email,
      //           EndPoint.Employee,
      //         );
      //         return {
      //           message: 'Password expire reset link sent to your email address',
      //           data: null,
      //         };
      //       }
      //     } catch (error) {
      //       throw new BadRequestException(error);
      //     }
      //   }
      const authenticationToken = await this.jsonWebTokenService.generateToken(
        {
          id: authUser.id?.toString(),
          userType: authUser.userType,
          driverID: authUser.driverID,
          // orgID: authUser.employee.orgID,
        },
        this.jsonWebTokenService.getSessionExpiryInSeconds(),
      );
      await this.sessionService.create({
        userID: authUser.id.toString(),
        token: authenticationToken,
        userType: authUser.userType,
        name: authUser.dataValues.name,
        employeeID:
          authUser.userType == UserType.Employee
            ? authUser?.employee?.id?.toString()
            : null,
        vendorID: null,
        driverID: authUser.driverID,
        vendorUserID:
          authUser.userType == UserType.Employee
            ? authUser?.vendorUser?.id?.toString()
            : null,
        orgID:
          authUser.userType == UserType.Employee
            ? authUser?.employee?.orgID
            : null,
        invalidated: false,
        roleID:
          authUser.userType == UserType.Employee
            ? authUser?.employee?.roleID
            : null,
        permissions:
          authUser.userType == UserType.Employee
            ? authUser.employee?.role?.permissions
            : authUser.vendorUser?.role?.permissions,
      });

      await this.driverAuthModel.update(
        { lastLogin: new Date() },
        {
          where: { id: authUser.id.toString() },
          returning: true,
        },
      );
      delete authUser.dataValues['hashedPassword'];
      delete authUser.dataValues['hashedOtp'];
      //   delete authUser.dataValues['employee'].dataValues['role'].dataValues[
      //     'permissions'
      //   ];
      res.header('token', authenticationToken);

      const eventPayload = JSON.parse(JSON.stringify(authUser));
      const eventLog = {
        objectType: 'Login',
        changeType: 'login',
        objectID: authUser.id,
        authID: authUser.id,
        updatedBy: authUser.name,
        payload: authUser,
        requestPayload: eventPayload,
        user: authUser,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Login successful',
        status: true,
        data: authUser,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async otpLogin(
    loginInput: DriverOtpVerificationInput,
    // endPoint: EndPoint,
  ): Promise<GenericResponse<any>> {
    try {
      const { phone } = loginInput;

      let authUser = await this.driverAuthModel.findOne({
        where: { phone },
        attributes: [
          'id',
          'email',
          'name',
          'phone',
          'status',
          'vendorID',
          'driverID',
        ],
        include: [
          {
            model: Driver,
            required: false,
            as: 'driver',
            attributes: ['id', 'name'],
            // required: false,
          },
        ],
      });
      if (!authUser) {
        const driver = await this.driverModel.findOne({
          where: {
            phone,
          },
        });
        if (driver) {
          const authInput = {
            phone: driver?.phone,
            email: driver?.email,
            userType: UserType.Driver,
            status: Status.Active,
            vendorID: driver?.vendorID,
            driverID: driver.id,
            name: driver?.name,
          };
          authUser = await this.driverAuthModel.create(authInput);
        } else {
          throw new BadRequestException(
            'Incorrect login details. Check your username and password.',
          );
        }
      }

      if (authUser.status === Status.Inactive) {
        throw new BadRequestException(
          'Your account has been deactivated. Please contact Your admin.',
        );
      }
      const updateData: Dict = {};

      if (!authUser.driverID || !authUser.vendorID) {
        const driver = await this.driverModel.findOne({
          where: { phone },
          attributes: ['id', 'name', 'vendorID'],
        });

        if (driver) {
          updateData.driverID = driver.id;
          updateData.vendorID = driver.vendorID;
        }
      }

      const otp = generateOTP();
      // const otp = '1234';
      const hashedOtp = await generateHashedOtp(otp);
      updateData.hashedOtp = hashedOtp;
      updateData.otpCreatedAt = new Date();
      const id = authUser?.id;
      await this.driverAuthModel.update(updateData, {
        where: { id },
      });
      // const message = 'OTP for your Connect SNDP - 1103 login is ' + otp;
      // const smsNumber = `+91${phone}`;
      // const templateId = '1707174401834878667';
      // const otpParams = [authUser.name, otp];
      // await this.smsService.sendSms(smsNumber, templateId, otpParams);
      const payloadSms = {
        organizationId: '000',
        event: 'driver.otp.login',
        queue: false,
        recipient: {
          phoneNumber: `91${phone}`,
          firstName: authUser.name,
          email: authUser.email,
          id: String(authUser.id),
        },
        data: {
          firstName: authUser.name,
          otp,
        },
        channels: [NotificationChannel.SMS],
        locale: 'en',
      };
      await this.notificationDispatcher.notify(payloadSms);
      return {
        message: 'OTP has been sent to registered phone number',
        // data: {
        //   otp: otp,
        // },
        status: true,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async otpLoginVerify(
    otpVerificationInput: OtpVerificationInput,
    res: Response,
  ): Promise<GenericResponse<any>> {
    try {
      const {
        phone,
        otp,
        deviceNo,
        deviceToken,
        deviceType,
        appVersion,
        osVersion,
      } = otpVerificationInput;

      const user = await this.driverAuthModel.findOne({
        where: {
          phone,
        },
        include: [
          {
            model: Driver,
            required: false,
            as: 'driver',
            attributes: ['id', 'name'],
          },
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['name', 'code', 'email', 'logo'],
            required: false,
          },
        ],
        attributes: [
          'id',
          'hashedOtp',
          'otpCreatedAt',
          'hashedPassword',
          'passwordCreatedAt',
          'email',
          'phone',
          'userType',
          //   'employeeID',
          'failedLoginAttempts',
          'status',
          'name',
        ],
      });
      if (!user) {
        throw new BadRequestException(
          'Incorrect login details. Check your phone number and OTP.',
        );
      }
      if (user.status === Status.Inactive) {
        throw new BadRequestException(
          'Your account has been deactivated. Please contact Your admin.',
        );
      }
      const configVersion = await this.configurationService.findOneMasterConfig(
        'DRIVER_APP_VERSION',
      );
      const requiredAppVersion = configVersion.data?.defaultValue;
      // If config is 0, skip check
      if (
        requiredAppVersion &&
        requiredAppVersion !== '0' &&
        requiredAppVersion !== null
      ) {
        if (!appVersion) {
          throw new BadRequestException('App version is required.');
        }
        const versionCheck = this.compareVersions(
          appVersion,
          requiredAppVersion,
        );

        if (versionCheck === -1) {
          throw new BadRequestException(
            `Your app version is outdated. Please update to version ${requiredAppVersion} or higher.`,
          );
        }
      }
      const failedUserLoginAttempts =
        (await this.passwordService.getConfigValue('FAILED_LOGIN_ATTEMPTS')) ??
        5;

      if (user.failedLoginAttempts > Number(failedUserLoginAttempts)) {
        await this.driverAuthModel.update(
          { status: Status.Inactive },
          {
            where: { id: user.id.toString() },
            returning: true,
          },
        );
        throw new BadRequestException(
          'Out of login attempts. Please contact Your admin.',
        );
      }

      if (!(await bcrypt.compare(otp, user?.hashedOtp))) {
        await this.driverAuthModel.increment('failedLoginAttempts', {
          by: 1,
          where: { id: user.id },
        });
        throw new BadRequestException({
          statusCode: 400,
          message: 'Invalid OTP',
          error: 'Bad Request',
          additionalData: {
            'remaining attempts':
              Number(failedUserLoginAttempts) - user.failedLoginAttempts,
          },
        });
      }
      const authenticationToken = await this.jsonWebTokenService.generateToken(
        {
          id: user.id?.toString(),
          userType: user.userType,
          // orgID: authUser.employee.orgID,
        },
        this.jsonWebTokenService.getSessionExpiryInSeconds(),
      );
      await this.sessionService.create({
        userID: null,
        token: authenticationToken,
        userType: user.userType,
        name: user?.name,
        driverID: user.userType == UserType.Driver ? user?.driver?.id : null,
        // employeeID:
        //   user.userType == UserType.Driver
        //     ? user?.employee?.id?.toString()
        //     : null,
        // orgID:
        //   user.userType == UserType.Employee ? user?.employee?.orgID : null,
        // vendorUserID:
        //   user.userType == UserType.Employee
        //     ? user?.vendorUser?.id?.toString()
        //     : null,
        // roleID:
        //   user.userType == UserType.Employee ? user?.employee?.roleID : null,
        invalidated: false,
        vendorID: null,
        // vendorUserID:
        //   user.userType == UserType.Employee
        //     ? user?.employee?.id?.toString()
        //     : null,
        // permissions:
        // user.userType == UserType.Employee
        //   ?
        //   user.employee?.role?.permissions,
        // : user.vendorUser?.role?.permissions,
      });

      if (user?.driver?.id && deviceToken?.trim()) {
        await this.driverDeviceInfoModel.create({
          driverID: user.driver.id,
          deviceNo: deviceNo,
          deviceToken,
          deviceType,
          appVersion,
          osVersion,
          lastLogin: new Date(),
        });
      }

      user.hashedOtp = null;
      user.failedLoginAttempts = 0;
      user.lastLogin = new Date();
      await user.save();
      //Genereate token for GPS server
      const GpsServerTimeOut = 5 * 60; // Set expiry as one day in seconds
      const GpsServerToken = await this.jsonWebTokenService.generateToken(
        {
          id: user.id?.toString(),
          userType: user.userType,
        },
        GpsServerTimeOut,
      );
      const apiUrl = this.configService.get('GPS_SERVER_API_URL');
      const apiResponse = await axios.post(`${apiUrl}/authentication`, {
        token: GpsServerToken,
        driverID: user.id?.toString(),
      });
      if (!apiResponse) {
        throw new InternalServerErrorException(
          'Failed to authenticate with GPS server',
        );
      }
      //#End
      delete user.dataValues['hashedPassword'];
      delete user.dataValues['hashedOtp'];
      delete user.dataValues['otpCreatedAt'];
      delete user.dataValues['passwordCreatedAt'];
      delete user.dataValues['failedLoginAttempts'];
      delete user.dataValues['status'];
      res.header('token', authenticationToken);
      res.header('gps-server-token', GpsServerToken);
      return {
        message: 'Login successful',
        data: user,
        status: true,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async unlockDriverAccount(driverID: string): Promise<GenericResponse<any>> {
    try {
      const [affectedCount] = await this.driverAuthModel.update(
        {
          failedLoginAttempts: 0,
          status: Status.Active,
        },
        {
          where: {
            driverID,
            userType: UserType.Driver,
          },
          returning: true,
        },
      );

      if (affectedCount === 0) {
        throw new BadRequestException(
          'No driver account found for the given driver ID.',
        );
      }

      return {
        message: 'Driver account unlocked successfully.',
        data: { driverID, failedLoginAttempts: 0, status: Status.Active },
        status: true,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  private compareVersions(v1: string, v2: string): number {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const num1 = v1Parts[i] || 0;
      const num2 = v2Parts[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  async logout(userID: string, userType: any): Promise<GenericResponse<null>> {
    try {
      await this.sessionService.invalidate(userID, userType);
      return { message: 'Logout successful', data: null };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }
}
