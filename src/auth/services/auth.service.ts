import {
  BadRequestException,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { compare } from 'bcryptjs';
import * as bcrypt from 'bcryptjs';
import { LoginInput, OtpVerificationInput } from '../dtos/login-input.dto';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { JsonWebTokenService } from '../../shared/utils/jwt';
import { GenericResponse } from 'src/shared/interfaces/generic-response';

import { SessionService } from './session.service';
import { EmployeeType, EndPoint, Status, UserType } from 'src/shared/enums';
import { Op, Transaction } from 'sequelize';
// import { Administrator } from 'src/administrator/models/administrator.model';
import { Authentication } from '../models/authentication.model';
import { Employee } from 'src/employee/models/employee.model';
import { Role } from 'src/role/models/role.model';
import { AuthenticationUserInput } from '../dtos/authentication-input.dto';
import {
  Dict,
  handleErrors,
  handleRegexErrors,
} from 'src/shared/utils/format-exception';
import { generateHashedOtp, generateOTP } from 'src/shared/utils/otp.utils';
import { PasswordService } from 'src/password-management/password/services/password.service';
import { EmailService } from 'src/email/email.service';
// import { Organization } from 'src/organization/models/organization.model';
import { Organization } from 'src/organization/models/organization.model';
import { PasswordHistoryService } from 'src/password-management/password-history/services/password-history.service';
import { VendorRole } from 'src/vendor-management/vendor-role/models/vendor-role.model';
import { VendorUser } from 'src/vendor-management/vendor-user/models/vendor-user.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { SmsService } from 'src/sms/services/sms.service';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import axios from 'axios';
import * as qs from 'qs';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { EmployeeDeviceInfo } from '../models/employee-device-model';
import { DriverOtpVerificationInput } from '../dtos/driver-login-input.dto';
import { NotificationDispatcherService } from 'src/notifications/services/notification-dispatcher.service';
import { NotificationChannel } from 'src/notifications/enums/notification-channel.enum';
// import * as jwt from 'jsonwebtoken';

export class AuthService {
  private logger = new Logger(AuthService.name);
  constructor(
    @Inject(SessionService)
    private sessionService: SessionService,
    @InjectModel(Authentication)
    private authModel: typeof Authentication,
    @InjectModel(Organization)
    private organizationModel: typeof Organization,
    @InjectModel(Vendor)
    private vendorModel: typeof Vendor,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(EmployeeDeviceInfo)
    private employeeDeviceInfoModel: typeof EmployeeDeviceInfo,
    private jsonWebTokenService: JsonWebTokenService,
    private configService: ConfigService, // private readonly sequelize: Sequelize,
    private passwordService: PasswordService,
    private emailService: EmailService,
    private smsService: SmsService,
    private passwordHistoryService: PasswordHistoryService,
    private eventlogService: EventLogService,
    private configurationService: ConfigurationService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  async login(
    loginInput: LoginInput,
    res: Response,
    endPonit: string,
  ): Promise<GenericResponse<any>> {
    try {
      const {
        email,
        phone,
        password,
        deviceNo,
        deviceToken,
        deviceType,
        appVersion,
        osVersion,
      } = loginInput;
      const conditions = [];
      if (email) conditions.push({ email: email });
      if (phone) conditions.push({ phone: phone });
      const authUser: any = await this.authModel.findOne({
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
        ],
        include: [
          {
            model: Employee,
            required: false,
            as: 'employee',
            attributes: ['id', 'name', 'roleID', 'orgID', 'employeeType'],
            include: [
              {
                model: Role,
                as: 'role',
                attributes: ['name', 'permissions', 'employeeType'],
                required: false,
              },
              {
                model: Organization,
                as: 'organization',
                attributes: ['id', 'name', 'status', 'logo'],
                required: true,
              },
            ],
            // required: false,
          },
        ],
      });
      if (!authUser) {
        throw new BadRequestException(
          'Incorrect login details. Check your username and password.',
        );
      } else if (
        authUser.userType === UserType.SuperAdmin &&
        endPonit !== EndPoint.Admin
      ) {
        throw new BadRequestException(
          'Invalid login details. Check your username and password.',
        );
      }
      if (
        authUser.userType === UserType.Employee &&
        endPonit === EndPoint.Employee
      ) {
        if (
          authUser.employee.employeeType === UserType.Admin &&
          authUser.employee.employeeType === UserType.Transport &&
          endPonit === EndPoint.Employee
        ) {
          throw new BadRequestException(
            'Invalid login details. Check your username and password.',
          );
        }
      } else if (
        authUser.userType === UserType.Employee &&
        endPonit === EndPoint.Admin
      ) {
        if (
          authUser.employee.employeeType !== UserType.Admin &&
          authUser.employee.employeeType !== UserType.Transport
        ) {
          throw new BadRequestException(
            'Invalid login details. Check your username and password.',
          );
        }
      }
      if (
        deviceType !== undefined &&
        deviceType !== 'web' &&
        authUser.employee?.employeeType !== EmployeeType.Admin &&
        authUser.userType !== UserType.SuperAdmin
      ) {
        const requiredAppVersion =
          await this.configurationService.getConfigValue(
            'EMP_APP_VERSION',
            authUser.employee.orgID,
          );
        // If config is 0, skip check
        if (requiredAppVersion && requiredAppVersion !== '0') {
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
      }
      const failedUserLoginAttempts = await this.passwordService.getConfigValue(
        'FAILED_LOGIN_ATTEMPTS',
        authUser?.employee?.orgID,
      );
      //  ?? 5;
      if (
        authUser.status === Status.Inactive &&
        authUser.userType === UserType.Employee &&
        authUser.employee?.employeeType != UserType.Transport
        //  || authUser.employee?.organization?.status === Status.Inactive
      ) {
        await this.organizationModel.update(
          { status: Status.Inactive },
          {
            where: { id: authUser.employee.orgID },
          },
        );
        throw new BadRequestException(
          'Your account has been deactivated. Please contact Your admin.',
        );
      }
      if (
        authUser.status === Status.Inactive &&
        authUser.employee?.employeeType === UserType.Transport
      ) {
        await this.employeeModel.update(
          { status: Status.Inactive },
          {
            where: { id: authUser.employeeID },
          },
        );

        throw new BadRequestException(
          'Your account has been deactivated. Please contact your admin.',
        );
      }
      if (authUser.failedLoginAttempts > failedUserLoginAttempts) {
        await this.authModel.update(
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
          await this.authModel.update(
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
      //  SuperAdmin password expiry check newly added
      if (authUser.userType === UserType.SuperAdmin) {
        try {
          const isExpired =
            await this.passwordService.checkPasswordExpiryByDefault(
              authUser?.passwordCreatedAt,
            );
          if (isExpired) {
            await this.generateResetPasswordLinkAndSendMail(
              authUser?.id?.toString(),
              {
                ...authUser,
                email: authUser?.email,
                name: authUser?.name,
              },
              authUser.userType,
              'reset-password',
              authUser?.email,
              EndPoint.Admin, // ← Admin endpoint for SuperAdmin
            );
            return {
              message:
                'Password expired. Reset link sent to your email address',
              data: null,
            };
          }
        } catch (error) {
          throw new BadRequestException(error);
        }
      }

      if (
        authUser.userType !== UserType.SuperAdmin &&
        authUser.employee.employeeType !== EmployeeType.Admin
      ) {
        try {
          const result = await this.passwordService.checkPasswordExists(
            authUser?.employeeID,
            authUser?.passwordCreatedAt,
          );
          if (result) {
            await this.generateResetPasswordLinkAndSendMail(
              authUser?.id?.toString(),
              {
                ...authUser,
                email: authUser?.email,
                name: authUser?.name,
              },
              authUser.userType,
              'reset-password',
              authUser?.email,
              EndPoint.Employee,
            );
            return {
              message:
                'Password expired. Reset link sent to your email address',
              data: null,
            };
          }
        } catch (error) {
          throw new BadRequestException(error);
        }
      }
      const authenticationToken = await this.jsonWebTokenService.generateToken(
        {
          id: authUser.id?.toString(),
          userType: authUser.userType,
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
          authUser.userType == UserType.Employee || UserType.Transport
            ? authUser?.employee?.id?.toString()
            : null,
        vendorID: null,
        vendorUserID:
          authUser.userType == UserType.Employee
            ? authUser?.vendorUser?.id?.toString()
            : null,
        orgID:
          authUser.userType == UserType.Employee || UserType.Transport
            ? authUser?.employee?.orgID
            : null,
        invalidated: false,
        roleID:
          authUser.userType == UserType.Employee || UserType.Transport
            ? authUser?.employee?.roleID
            : null,
        permissions:
          authUser.userType == UserType.Employee || UserType.Transport
            ? authUser.employee?.role?.permissions
            : authUser.vendorUser?.role?.permissions,
      });

      await this.authModel.update(
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

      if (authUser?.employee?.id && deviceToken?.trim()) {
        await this.employeeDeviceInfoModel.create({
          employeeID: parseInt(authUser.employee.id.toString(), 10),
          deviceNo: deviceNo,
          deviceToken,
          deviceType,
          appVersion,
          osVersion,
          lastLogin: new Date(),
        });
      }
      // Generate token for GPS server (1 Day expiry)
      const GpsServerTimeOut = 5 * 60;
      const GpsServerToken = await this.jsonWebTokenService.generateToken(
        {
          id: authUser.id?.toString(),
          userType: authUser.userType,
        },
        GpsServerTimeOut,
      );

      // Optional: authenticate with GPS server if needed
      const apiUrl = this.configService.get('GPS_SERVER_API_URL');
      const apiResponse = await axios.post(`${apiUrl}/authentication`, {
        token: GpsServerToken,
        employeeID: authUser.id?.toString(),
      });
      if (!apiResponse) {
        throw new InternalServerErrorException(
          'Failed to authenticate with GPS server',
        );
      }
      res.header('token', authenticationToken);
      res.header('gps-server-token', GpsServerToken);

      const eventPayload = JSON.parse(JSON.stringify(authUser));
      // Role.employeeType (e.g. "Security Manager") is distinct from
      // Employee.employeeType (the coarse "Transport Team"/"Employee"
      // category) — this is the specific role name, tagged onto the
      // description so "who logged in" is identifiable at a glance
      // without expanding the row.
      const roleTag = authUser.employee?.role?.employeeType
        ? ` (${authUser.employee.role.employeeType})`
        : '';
      const eventLog = {
        objectType: 'Login',
        changeType: 'login',
        objectID: authUser.id,
        authID: authUser.id,
        updatedBy: authUser.name,
        payload: {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          phone: authUser.phone,
          status: authUser.status,
          employee: authUser.employee?.name ?? 'N/A',
          userType: authUser.userType,
          employeeID: authUser.employeeID ?? 'N/A',
          // otpCreatedAt: authUser.otpCreatedAt,
          // passwordCreatedAt: authUser.passwordCreatedAt,
          failedLoginAttempts: authUser.failedLoginAttempts,
        },
        requestPayload: eventPayload,
        customDescription: `${roleTag} has been logged in`,
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

  async generateResetPasswordLinkAndSendMail(
    userId: string,
    userData: any,
    userType: string,
    action: 'account-created' | 'reset-password' | 'email-verification',
    email: string,
    endPoint: EndPoint,
    transaction?: Transaction,
  ): Promise<void> {
    const updateData: Dict = {};
    const passwordResetToken = await this.jsonWebTokenService.generateToken(
      { id: userId, userType },
      '10m',
    );
    updateData.passwordResetToken = passwordResetToken;
    await this.authModel.update(updateData, {
      returning: true,
      where: { id: userId, userType },
      transaction,
    });
    let url: string;
    if (endPoint === EndPoint.Vendor) {
      url = this.configService.get('VENDOR_VERIFY_URL');
    } else if (endPoint === EndPoint.Admin) {
      url = this.configService.get('ADMIN_VERIFY_URL');
    } else if (endPoint === EndPoint.Employee) {
      url = this.configService.get('EMPLOYEE_VERIFY_URL');
    } else {
      url = '';
    }
    // if (userType === 'Vendor') {
    //   url = this.configService.get('VENDOR_VERIFY_URL');
    // } else if (userType === 'Admin') {
    //   url = this.configService.get('ADMIN_VERIFY_URL');
    // } else if (userType === 'Employee') {
    //   url = this.configService.get('EMPLOYEE_VERIFY_URL');
    // } else {
    //   url = '';
    // }
    await this.emailService.sendEmail({
      mailTo: [email],
      subject: action
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase()),
      templateName: action,
      isAttachments: false,
      attachments: null,
      mailBody: {
        name: userData?.name,
        link: `${url}/${action}/${passwordResetToken}`,
      },
    });
  }

  async otpLogin(
    loginInput: DriverOtpVerificationInput,
    endPoint: EndPoint,
  ): Promise<GenericResponse<any>> {
    try {
      const { phone } = loginInput;
      const userType =
        endPoint == EndPoint.Admin
          ? [UserType.Admin, UserType.SuperAdmin, EndPoint.Employee]
          : endPoint == EndPoint.Employee
          ? [EndPoint.Employee]
          : [UserType.Vendor];
      const authUser = await this.authModel.findOne({
        where: {
          phone,
          userType: {
            [Op.in]: userType,
          },
        },
        include: [
          {
            model: Employee,
            required: false,
            as: 'employee',
            attributes: ['id', 'employeeType', 'orgID'],
            // required: false,
          },
        ],
      });
      if (!authUser) {
        throw new BadRequestException(
          'Incorrect login details. Check your phone number.',
        );
      } else if (
        authUser.userType === UserType.SuperAdmin &&
        endPoint !== EndPoint.Admin
      ) {
        throw new BadRequestException(
          'Incorrect login details. Check your phone number.',
        );
      }
      if (
        authUser.userType === UserType.Employee &&
        endPoint === EndPoint.Employee
      ) {
        if (
          authUser.employee.employeeType === EmployeeType.Admin &&
          endPoint === EndPoint.Employee
        ) {
          throw new BadRequestException(
            'Incorrect login details. Check your phone number.',
          );
        }
      } else if (
        authUser.userType === UserType.Employee &&
        endPoint === EndPoint.Admin
      ) {
        if (
          authUser.employee.employeeType !== EmployeeType.Admin &&
          authUser.employee.employeeType !== EmployeeType.Transportation
        ) {
          throw new BadRequestException(
            'Incorrect login details. Check your phone number.',
          );
        }
      }
      if (authUser.status === Status.Inactive) {
        throw new BadRequestException(
          'Your account has been deactivated. Please contact Your admin.',
        );
      }
      const updateData: Dict = {};

      const otp = generateOTP();
      const hashedOtp = await generateHashedOtp(otp);
      updateData.hashedOtp = hashedOtp;
      updateData.otpCreatedAt = new Date();
      const id = authUser?.id;
      await this.authModel.update(updateData, {
        where: { id },
      });
      // const message = 'OTP for your Connect SNDP - 1103 login is ' + otp;
      // const smsNumber = `+91${phone}`;
      // const templateId = '1707174401834878667';
      // const otpParams = [authUser.name, otp];
      // await this.smsService.sendSms(smsNumber, templateId, otpParams);
      const isSuperAdmin = authUser.userType === UserType.SuperAdmin;
      const orgID = isSuperAdmin
        ? '333'
        : String(authUser.employee?.orgID ?? '111'); // 333-> SA, 111-> vendor
      const event = isSuperAdmin
        ? 'superAdmin.otp.login'
        : orgID === '111'
        ? 'vendor.otp.login'
        : 'otp.login';
      const payloadSms = {
        organizationId: orgID,
        event: event,
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
        empID:
          authUser?.employeeID != null ? String(authUser.employeeID) : null,
      };
      await this.notificationDispatcher.notify(payloadSms);
      return {
        message: 'OTP has been sent to registered phone number',
        // data: {
        //   otp: otp,
        // },
        status: true,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async otpLoginVerify(
    otpVerificationInput: OtpVerificationInput,
    res: Response,
    endPoint: EndPoint,
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

      const userType =
        endPoint == EndPoint.Admin
          ? [UserType.Admin, UserType.SuperAdmin, EndPoint.Employee]
          : endPoint == EndPoint.Employee
          ? [EndPoint.Employee]
          : [UserType.Vendor];
      const user = await this.authModel.findOne({
        where: {
          phone,
          userType: {
            [Op.in]: userType,
          },
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
        ],
        include: [
          {
            model: Employee,
            required: false,
            as: 'employee',
            attributes: ['id', 'name', 'roleID', 'orgID', 'employeeType'],
            include: [
              {
                model: Role,
                as: 'role',
                attributes: ['name', 'permissions'],
                required: false,
              },
              {
                model: Organization,
                as: 'organization',
                attributes: ['id', 'name', 'status', 'logo'],
                required: true,
              },
              {
                model: Role,
                as: 'role',
                attributes: ['name', 'permissions', 'employeeType'],
                required: false,
              },
            ],
          },
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
      if (
        user.employee?.employeeType !== EmployeeType.Admin &&
        user.employee?.employeeType !== EmployeeType.Transportation &&
        user.userType !== UserType.SuperAdmin
      ) {
        const requiredAppVersion =
          await this.configurationService.getConfigValue(
            'EMP_APP_VERSION',
            user.employee.orgID,
          );
        // If config is 0, skip check
        if (requiredAppVersion && requiredAppVersion !== '0') {
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
      }
      const failedUserLoginAttempts =
        (await this.passwordService.getConfigValue('FAILED_LOGIN_ATTEMPTS')) ??
        5;

      if (user.failedLoginAttempts > Number(failedUserLoginAttempts)) {
        await this.authModel.update(
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
      if (user?.hashedOtp === null) {
        throw new BadRequestException('Incorrect OTP. Please try again later.');
      }
      const otpExpiryTime = 2 * 60 * 1000; //2 mins
      const otpExpiryCheck = Date.now() - new Date(user.otpCreatedAt).getTime();
      if (otpExpiryCheck > otpExpiryTime) {
        throw new BadRequestException(
          'OTP has expired. Please request a new one.',
        );
      }
      if (!(await bcrypt.compare(otp, user?.hashedOtp))) {
        await this.authModel.increment('failedLoginAttempts', {
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
        userID: user.id.toString(),
        token: authenticationToken,
        userType: user.userType,
        name: user?.name,
        employeeID:
          user.userType == UserType.Employee || user.userType == UserType.Admin
            ? user?.employee?.id?.toString()
            : null,
        orgID:
          user.userType == UserType.Employee || user.userType == UserType.Admin
            ? user?.employee?.orgID
            : null,
        // vendorUserID:
        //   user.userType == UserType.Employee
        //     ? user?.vendorUser?.id?.toString()
        //     : null,
        roleID:
          user.userType == UserType.Employee ? user?.employee?.roleID : null,
        invalidated: false,
        vendorID: null,
        vendorUserID:
          // user.userType == UserType.Employee
          //   ? user?.employee?.id?.toString()
          //   :
          null,
        permissions:
          // user.userType == UserType.Employee
          //   ?
          user.employee?.role?.permissions,
        // : user.vendorUser?.role?.permissions,
      });

      if (user?.employee?.id && deviceToken?.trim()) {
        await this.employeeDeviceInfoModel.create({
          employeeID: user.employee.id,
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
      // res.header('token', authenticationToken);
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
        employeeID: user.id?.toString(),
      });
      if (!apiResponse) {
        throw new InternalServerErrorException(
          'Failed to authenticate with GPS server',
        );
      }
      //#End

      delete user.dataValues['hashedPassword'];
      delete user.dataValues['lastLogin'];
      delete user.dataValues['updatedAt'];
      delete user.dataValues['hashedOtp'];
      res.header('token', authenticationToken);
      res.header('gps-server-token', GpsServerToken);
      const eventPayload = JSON.parse(JSON.stringify(user));
      const roleTag = user.employee?.role?.employeeType
        ? ` (${user.employee.role.employeeType})`
        : '';
      const eventLog = {
        objectType: 'Login',
        changeType: 'login',
        objectID: user.id,
        authID: user.id,
        updatedBy: user.name,
        payload: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          employee: user.employee?.name ?? 'N/A',
          userType: user.userType,
          employeeID: user.employeeID ?? 'N/A',
          // otpCreatedAt: authUser.otpCreatedAt,
          // passwordCreatedAt: authUser.passwordCreatedAt,
          failedLoginAttempts: user.failedLoginAttempts,
        },
        requestPayload: eventPayload,
        customDescription: `${roleTag} has been logged in`,
        user,
      };
      this.eventlogService.create(eventLog);
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

  async create(
    createAuthInput: AuthenticationUserInput,
    transaction?: Transaction,
  ): Promise<Authentication> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.authModel,
        ['email', 'phone'],
        createAuthInput,
        null,
      );
      handleErrors(validationErrors, 'unique');
      const hashedPassword = createAuthInput.password
        ? await this.generateHashedPassword(createAuthInput.password)
        : null;
      const userInput = { ...createAuthInput, hashedPassword };
      const user = await this.authModel.create(userInput, {
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

  async logout(userID: any): Promise<GenericResponse<null>> {
    try {
      await this.sessionService.invalidate(userID);
      return { message: 'Logout successful', data: null };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async forgotPassword(
    email: string,
    userType: string,
    endPoint?: EndPoint,
  ): Promise<any> {
    try {
      const authUser = await this.authModel.findOne({
        where: { email, status: Status.Active },
      });
      if (!authUser) {
        throw new BadRequestException('User not found');
      }
      if (userType === UserType.Employee) {
        const employeeUser = await this.employeeModel.findOne({
          where: {
            email,
            status: Status.Active,
          },
        });

        if (employeeUser?.employeeType === 'Admin') {
          endPoint = EndPoint.Admin;
        }
      }
      const resetPasswordUserType = authUser.userType;
      const userData = {
        ...authUser?.[
          userType === UserType.Employee
            ? 'Employee'
            : userType === UserType.Vendor
            ? 'Vendor'
            : null
        ]?.dataValues,
        email: authUser?.email,
        name: authUser?.name,
      };
      await this.generateResetPasswordLinkAndSendMail(
        authUser?.id?.toString(),
        userData,
        resetPasswordUserType,
        'reset-password',
        authUser?.email,
        endPoint,
      );
      return {
        message: 'Password reset link sent to your email address',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  //previous function used
  // async resetUserPassword(
  //   passwordResetToken: string,
  //   password: string,
  // ): Promise<GenericResponse<null>> {
  //   try {
  //     const { id } = await this.jsonWebTokenService.verifyToken(
  //       passwordResetToken,
  //     );
  //     if (id) {
  //       const authUser = await this.authModel.findOne({
  //         where: {
  //           id: id,
  //           passwordResetToken,
  //         },
  //         include: [
  //           {
  //             model: Employee,
  //             required: false,
  //             as: 'employee',
  //             attributes: ['id', 'name', 'roleID', 'orgID'],
  //           },
  //         ],
  //       });
  //       if (authUser) {
  //         const hashedPassword = await this.generateHashedPassword(password);
  //         const authenticationUpdateData = {
  //           hashedPassword,
  //           passwordResetToken: null,
  //           passwordCreatedAt: new Date(),
  //         };
  //         if (!authUser?.employeeID) {
  //           await this.authModel.update(authenticationUpdateData, {
  //             where: { id: authUser.id.toString() },
  //             returning: true,
  //           });
  //           return {
  //             message: 'Password reset successfully',
  //             data: null,
  //           };
  //         }

  //         const result = await this.passwordService.isPasswordStrong(
  //           password,
  //           authUser?.employee?.orgID,
  //         );
  //         if (!result?.error) {
  //           handleRegexErrors(
  //             [
  //               {
  //                 fieldName: 'newPassword',
  //                 error: true,
  //                 info: result?.info,
  //               },
  //             ],
  //             'regex',
  //           );
  //           throw new BadRequestException(
  //             'Password does not meet the required strength criteria.',
  //           );
  //         }
  //         const passwordHistory =
  //           await this.passwordHistoryService.findByEmployeeId(
  //             authUser?.employeeID,
  //           );
  //         if (passwordHistory.length == 0) {
  //           await this.authModel.update(authenticationUpdateData, {
  //             where: { id: authUser.id.toString() },
  //             returning: true,
  //           });
  //           await this.passwordHistoryService.addPasswordHistory(
  //             // authUser?.employee?.id,
  //             hashedPassword,
  //             authUser?.employee?.id
  //           );
  //         } else {
  //           if (
  //             await this.passwordService.isPasswordReused(
  //               authUser?.employee?.id,
  //               password,
  //               authUser?.employee?.orgID,
  //             )
  //           ) {
  //             throw new NotFoundException('The password is already used');
  //           } else {
  //             await this.authModel.update(authenticationUpdateData, {
  //               where: { id: authUser.id.toString() },
  //               returning: true,
  //             });
  //             await this.passwordHistoryService.addPasswordHistory(
  //               // authUser?.employee?.id,
  //               hashedPassword,
  //               authUser?.employee?.id,
  //             );
  //           }
  //         }
  //         return {
  //           message: 'Password reset successfully',
  //           data: null,
  //         };
  //       } else {
  //         throw new NotFoundException('Invalid token');
  //       }
  //     }
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  async resetUserPassword(
    passwordResetToken: string,
    password: string,
  ): Promise<GenericResponse<null>> {
    try {
      const { id } = await this.jsonWebTokenService.verifyToken(
        passwordResetToken,
      );

      if (!id) {
        throw new NotFoundException('Invalid token');
      }

      if (id) {
        const authUser = await this.authModel.findOne({
          where: {
            id: id,
            passwordResetToken,
          },
          include: [
            {
              model: Employee,
              required: false,
              as: 'employee',
              attributes: ['id', 'name', 'roleID', 'orgID'],
            },
          ],
        });

        if (!authUser) {
          throw new NotFoundException('Invalid token');
        }

        // ---------------------------------------------------
        // PASSWORD STRENGTH VALIDATION
        // ---------------------------------------------------
        const result = await this.passwordService.isPasswordStrong(
          password,
          authUser?.employee?.orgID, // undefined for  SuperAdmin only
        );

        if (!result?.error) {
          handleRegexErrors(
            [
              {
                fieldName: 'newPassword',
                error: true,
                info: result?.info,
              },
            ],
            'regex',
          );

          throw new BadRequestException(result.message);
        }
        // ---------------------------------------------------
        // PASSWORD REUSE CHECK
        // ---------------------------------------------------
        const isReused = await this.passwordService.isPasswordReused(
          authUser?.employee?.id, // employeeID
          password,
          authUser?.employee?.orgID, // orgID
          authUser?.id, // authID for SuperAdmin
        );

        if (isReused) {
          throw new BadRequestException(
            'Password already used before. Please choose a different password.',
          );
        }
        // ---------------------------------------------------
        // HASH PASSWORD
        // ---------------------------------------------------
        const hashedPassword = await this.generateHashedPassword(password);

        const authenticationUpdateData = {
          hashedPassword,
          passwordResetToken: null,
          passwordCreatedAt: new Date(),
        };

        // ---------------------------------------------------
        // UPDATE PASSWORD
        // ---------------------------------------------------

        await this.authModel.update(authenticationUpdateData, {
          where: { id: authUser.id.toString() },
          returning: true,
        });
        // Invalidate session on password reset
        await this.sessionService.invalidate(authUser.id.toString());

        // ---------------------------------------------------
        // SAVE PASSWORD HISTORY
        // ---------------------------------------------------

        await this.passwordHistoryService.addPasswordHistory(
          hashedPassword,
          authUser?.employee?.id || null, // employeeID
          authUser?.id || null, // authID
        );

        return {
          message: 'Password reset successfully',
          data: null,
        };
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }

      throw new InternalServerErrorException(error);
    }
  }

  // async resetVendorPassword(
  //   passwordResetToken: string,
  //   password: string,
  // ): Promise<GenericResponse<null>> {
  //   try {
  //     const { id, userType } = await this.jsonWebTokenService.verifyToken(
  //       passwordResetToken,
  //     );

  //     if (!id || userType !== UserType.Vendor) {
  //       throw new NotFoundException('Invalid token');
  //     }

  //     const authUser = await this.authModel.findOne({
  //       where: {
  //         id: id,
  //         passwordResetToken,
  //       },
  //     });

  //     if (!authUser) {
  //       throw new NotFoundException('Invalid token');
  //     }

  //     const hashedPassword = await this.generateHashedPassword(password);
  //     const authenticationUpdateData = {
  //       hashedPassword,
  //       passwordResetToken: null,
  //       passwordCreatedAt: new Date(),
  //     };

  //     const result = await this.passwordService.isPasswordStrong(password);
  //     if (!result?.error) {
  //       handleRegexErrors(
  //         [
  //           {
  //             fieldName: 'newPassword',
  //             error: true,
  //             info: result?.info,
  //           },
  //         ],
  //         'regex',
  //       );
  //       throw new BadRequestException(
  //         'Password does not meet the required strength criteria.',
  //       );
  //     }
  //     await this.authModel.update(authenticationUpdateData, {
  //       where: { id: authUser.id.toString() },
  //       returning: true,
  //     });
  //     return {
  //       message: 'Password reset successfully',
  //       data: null,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  async resetVendorPassword(
    passwordResetToken: string,
    password: string,
  ): Promise<GenericResponse<null>> {
    try {
      const { id, userType } = await this.jsonWebTokenService.verifyToken(
        passwordResetToken,
      );

      if (!id || userType !== UserType.Vendor) {
        throw new NotFoundException('Invalid token');
      }

      const authUser = await this.authModel.findOne({
        where: {
          id: id,
          passwordResetToken,
        },
      });

      if (!authUser) {
        throw new NotFoundException('Invalid token');
      }
      // step 1
      const result = await this.passwordService.isPasswordStrong(password);
      if (!result?.error) {
        handleRegexErrors(
          [
            {
              fieldName: 'newPassword',
              error: true,
              info: result?.info,
            },
          ],
          'regex',
        );
        throw new BadRequestException(
          'Password does not meet the required strength criteria.',
        );
      }

      // step 2
      const isReused = await this.passwordService.isPasswordReused(
        null, // employeeID → null for vendor
        password,
        null, // organizationID → null, will use defaultValue
        authUser.id, // authID
      );
      if (isReused) {
        throw new BadRequestException(
          'Password already used before. Please choose a different password.',
        );
      }

      const hashedPassword = await this.generateHashedPassword(password);
      const authenticationUpdateData = {
        hashedPassword,
        passwordResetToken: null,
        passwordCreatedAt: new Date(),
      };

      await this.authModel.update(authenticationUpdateData, {
        where: { id: authUser.id.toString() },
        returning: true,
      });
      // Invalidate session on password reset
      await this.sessionService.invalidate(authUser.id.toString());

      //  Step 3 — Save NEW hashed password to history
      await this.passwordHistoryService.addPasswordHistory(
        hashedPassword,
        null, // employeeID → null for vendor
        authUser.id, // authID
      );

      return {
        message: 'Password reset successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async vendorLogin(
    loginInput: LoginInput,
    res: Response,
  ): Promise<GenericResponse<any>> {
    try {
      const { email, phone, password } = loginInput;
      const conditions = [];
      if (email) conditions.push({ email: email });
      if (phone) conditions.push({ phone: phone });
      const authUser: any = await this.authModel.findOne({
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
          'vendorID',
          'vendorUserID',
          'failedLoginAttempts',
          'status',
          'name',
        ],
        include: [
          {
            model: VendorUser,
            as: 'vendorUser',
            attributes: ['id', 'name', 'vendorID', 'vendorRoleID'],
            include: [
              {
                model: VendorRole,
                as: 'vendorRole',
                attributes: ['name', 'permissions'],
                required: false,
              },
            ],
            // required: false,
          },
        ],
      });
      if (!authUser) {
        throw new BadRequestException(
          'Incorrect login details. Check your username and password.',
        );
      }
      if (authUser.userType === UserType.SuperAdmin) {
        throw new BadRequestException(
          'Incorrect login details. Check your username and password.',
        );
      }
      if (authUser.userType != UserType.Vendor) {
        throw new BadRequestException(
          'Incorrect login details. Check your username and password.',
        );
      }
      const failedUserLoginAttempts =
        (await this.passwordService.getConfigValue('FAILED_LOGIN_ATTEMPTS')) ??
        5;
      if (
        authUser.status === Status.Inactive
        //  || authUser.employee?.organization?.status === Status.Inactive
      ) {
        await this.vendorModel.update(
          { status: Status.Inactive },
          {
            where: { id: authUser.vendorID.toString() },
            returning: true,
          },
        );
        throw new BadRequestException(
          'Your account has been deactivated. Please contact Your admin.',
        );
      }
      if (authUser.failedLoginAttempts > failedUserLoginAttempts) {
        await this.authModel.update(
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
          await this.authModel.update(
            { failedLoginAttempts: authUser.failedLoginAttempts + 1 },
            {
              where: { id: authUser.id.toString() },
              returning: true,
            },
          );
          throw new BadRequestException(
            'Incorrect login. Check your username and password.',
          );
        }
      } else {
        throw new BadRequestException(
          'Incorrect login details. Check your username and password.',
        );
      }
      // const expiryTime = parseInt(
      //   this.configService.get('JWT_EXPIRY_IN_SECONDS'),
      //   10,
      // );

      //  Add password expiry check for Vendor (no orgID — uses defaultValue) newly added
      try {
        const isExpired =
          await this.passwordService.checkPasswordExpiryByDefault(
            authUser?.passwordCreatedAt, // reuse same method — both use defaultValue
          );
        if (isExpired) {
          await this.generateResetPasswordLinkAndSendMail(
            authUser?.id?.toString(),
            {
              ...authUser,
              email: authUser?.email,
              name: authUser?.name,
            },
            authUser.userType,
            'reset-password',
            authUser?.email,
            EndPoint.Vendor, // ← Vendor endpoint
          );
          return {
            message: 'Password expired. Reset link sent to your email address',
            data: null,
          };
        }
      } catch (error) {
        throw new BadRequestException(error);
      }

      const authenticationToken = await this.jsonWebTokenService.generateToken(
        {
          id: authUser.id?.toString(),
          userType: authUser.userType,
          // orgID: authUser.employee.orgID,
        },
        this.jsonWebTokenService.getSessionExpiryInSeconds(),
      );
      await this.sessionService.create({
        userID: authUser.id.toString(),
        token: authenticationToken,
        userType: authUser.userType,
        name: authUser.dataValues.name,
        vendorID: authUser.vendorUser.dataValues.vendorID,
        vendorUserID:
          authUser.userType == UserType.Vendor
            ? authUser?.vendorUserID?.toString()
            : null,
        rolwID:
          authUser.userType == UserType.Employee
            ? authUser.employee?.roleID
            : authUser.vendorUser?.vendorRoleID,
        invalidated: false,
        permissions:
          authUser.userType == UserType.Employee
            ? authUser.employee?.role?.permissions
            : authUser.vendorUser?.vendorRole?.permissions,
      });

      await this.authModel.update(
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

  async resetEmployeePassword(
    id: string,
    password: string,
  ): Promise<GenericResponse<Authentication>> {
    try {
      if (id) {
        const authUser = await this.authModel.findOne({
          where: {
            id: id,
          },
          include: [
            {
              model: Employee,
              required: false,
              as: 'employee',
              attributes: ['id', 'name', 'roleID', 'orgID'],
            },
          ],
        });
        // return {
        //   message: 'Employee password reset process initiated',
        //   data: authUser,
        // };
        if (authUser) {
          const hashedPassword = await this.generateHashedPassword(password);
          const authenticationUpdateData = {
            hashedPassword,
            passwordResetToken: null,
            passwordCreatedAt: new Date(),
          };

          const result = await this.passwordService.isPasswordStrong(
            password,
            authUser?.employee?.orgID,
          );
          if (!result?.error) {
            handleRegexErrors(
              [
                {
                  fieldName: 'newPassword',
                  error: true,
                  info: result?.info,
                },
              ],
              'regex',
            );
            throw new BadRequestException(
              'Password does not meet the required strength criteria.',
            );
          }
          const passwordHistory =
            await this.passwordHistoryService.findByEmployeeId(
              authUser?.employeeID,
            );
          if (passwordHistory.length == 0) {
            await this.authModel.update(authenticationUpdateData, {
              where: { id: authUser.id.toString() },
              returning: true,
            });
            await this.sessionService.invalidate(authUser.id.toString()); // kill all existing sessions when password is changes
            await this.passwordHistoryService.addPasswordHistory(
              hashedPassword,
              authUser?.employee?.id,
            );
          } else {
            if (
              await this.passwordService.isPasswordReused(
                authUser?.employee?.id,
                password,
                authUser?.employee?.orgID,
              )
            ) {
              throw new NotFoundException('The password is already used');
            } else {
              await this.authModel.update(authenticationUpdateData, {
                where: { id: authUser.id.toString() },
                returning: true,
              });
              await this.sessionService.invalidate(authUser.id.toString()); // kill all existing sessions when password is changes
              await this.passwordHistoryService.addPasswordHistory(
                hashedPassword,
                authUser?.employee?.id,
              );
            }
          }
          return {
            message: 'Password reset successfully',
            data: null,
          };
        } else {
          throw new NotFoundException('Invalid token');
        }
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getOktaParamsByDomain(domain: string): Promise<any> {
    const orgRecord = await this.organizationModel.findOne({
      where: { domainName: domain },
    });

    if (!orgRecord) {
      return {};
    }
    const orgID = orgRecord.id;
    // const [clientId, clientSecret, redirectUri, issuer] = await Promise.all([
    //   this.configurationService.getConfigValue('OKTA_CLIENT_ID', orgID),
    //   this.configurationService.getConfigValue('OKTA_CLIENT_SECRET', orgID),
    //   this.configurationService.getConfigValue('OKTA_REDIRECT_URI', orgID),
    //   this.configurationService.getConfigValue('OKTA_ISSUER', orgID),
    // ]);
    const configValues =
      await this.configurationService.getMultipleConfigValues(
        [
          'OKTA_CLIENT_ID',
          'OKTA_CLIENT_SECRET',
          'OKTA_REDIRECT_URI',
          'OKTA_ISSUER',
        ],
        { orgID },
      );

    const {
      OKTA_CLIENT_ID: clientId,
      OKTA_CLIENT_SECRET: clientSecret,
      OKTA_REDIRECT_URI: redirectUri,
      OKTA_ISSUER: issuer,
    } = configValues?.data || {};

    if (!clientId || !clientSecret || !redirectUri || !issuer) {
      throw new BadRequestException(
        'Okta configuration missing for organization',
      );
    }
    return { clientId, clientSecret, redirectUri, issuer };
  }

  async getTokensByCode(code: string, oktaParams: any) {
    const tokenUrl = `${oktaParams?.issuer}/oauth2/v1/token`;

    const params = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: oktaParams?.redirectUri,
      client_id: oktaParams?.clientId,
      client_secret: oktaParams?.clientSecret,
    };

    const response = await axios.post(tokenUrl, qs.stringify(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data;
  }

  async getOktaUserInfo(accessToken: string, oktaParams: any) {
    const userInfoUrl = `${oktaParams?.issuer}/oauth2/v1/userinfo`;

    const response = await axios.get(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  }

  async oktaLogin(
    domain: string,
    code: string,
    state: string,
    res: any,
  ): Promise<any> {
    try {
      const oktaParams = await this.getOktaParamsByDomain(domain);
      const tokens = await this.getTokensByCode(code, oktaParams);
      const userInfo = await this.getOktaUserInfo(
        tokens?.access_token,
        oktaParams,
      );

      if (!userInfo.email) return;

      const conditions = [];
      if (userInfo?.email) conditions.push({ email: userInfo.email });
      const authUser: any = await this.authModel.findOne({
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
        ],
        include: [
          {
            model: Employee,
            required: false,
            as: 'employee',
            attributes: ['id', 'name', 'roleID', 'orgID', 'employeeType'],
            include: [
              {
                model: Role,
                as: 'role',
                attributes: ['name', 'permissions'],
                required: false,
              },
              {
                model: Organization,
                as: 'organization',
                attributes: ['id', 'name', 'status', 'logo'],
                required: true,
              },
              {
                model: Role,
                as: 'role',
                attributes: ['name', 'permissions', 'employeeType'],
                required: false,
              },
            ],
            // required: false,
          },
        ],
      });

      const authenticationToken = await this.jsonWebTokenService.generateToken(
        {
          id: authUser.id?.toString(),
          userType: authUser.userType,
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
          authUser.userType == UserType.Employee || UserType.Transport
            ? authUser?.employee?.id?.toString()
            : null,
        vendorID: null,
        vendorUserID:
          authUser.userType == UserType.Employee
            ? authUser?.vendorUser?.id?.toString()
            : null,
        orgID:
          authUser.userType == UserType.Employee || UserType.Transport
            ? authUser?.employee?.orgID
            : null,
        invalidated: false,
        roleID:
          authUser.userType == UserType.Employee || UserType.Transport
            ? authUser?.employee?.roleID
            : null,
        permissions:
          authUser.userType == UserType.Employee || UserType.Transport
            ? authUser.employee?.role?.permissions
            : authUser.vendorUser?.role?.permissions,
      });

      await this.authModel.update(
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
      // Generate token for GPS server (1 Day expiry)
      const GpsServerTimeOut = 24 * 60 * 60;
      const GpsServerToken = await this.jsonWebTokenService.generateToken(
        {
          id: authUser.id?.toString(),
          userType: authUser.userType,
        },
        GpsServerTimeOut,
      );

      // Optional: authenticate with GPS server if needed
      const apiUrl = this.configService.get('GPS_SERVER_API_URL');
      const apiResponse = await axios.post(`${apiUrl}/authentication`, {
        token: GpsServerToken,
        employeeID: authUser.id?.toString(),
      });
      if (!apiResponse) {
        throw new InternalServerErrorException(
          'Failed to authenticate with GPS server',
        );
      }
      res.header('token', authenticationToken);
      res.header('gps-server-token', GpsServerToken);

      const eventPayload = JSON.parse(JSON.stringify(authUser));
      const roleTag = authUser.employee?.role?.employeeType
        ? ` (${authUser.employee.role.employeeType})`
        : '';
      const eventLog = {
        objectType: 'Login',
        changeType: 'login',
        objectID: authUser.id,
        authID: authUser.id,
        updatedBy: authUser.name,
        payload: {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          phone: authUser.phone,
          status: authUser.status,
          employee: authUser.employee?.name ?? 'N/A',
          userType: authUser.userType,
          employeeID: authUser.employeeID ?? 'N/A',
          // otpCreatedAt: authUser.otpCreatedAt,
          // passwordCreatedAt: authUser.passwordCreatedAt,
          failedLoginAttempts: authUser.failedLoginAttempts,
        },
        requestPayload: eventPayload,
        customDescription: `${roleTag} has been logged in`,
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
}
