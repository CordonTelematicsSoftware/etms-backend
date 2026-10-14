import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { Profile } from '../model/profile.model';
import { Transaction } from 'sequelize';
import { Employee } from 'src/employee/models/employee.model';
import { Authentication } from 'src/auth/models/authentication.model';
import { VendorUser } from 'src/vendor-management/vendor-user/models/vendor-user.model';
import { UpdateProfileInput } from '../dtos/update-profile-input.dto';
import { UploadService } from 'src/upload/services/upload.service';
import { ConfigService } from '@nestjs/config';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { ApprovalRequest } from 'src/approval-request/models/approval-request.model';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { ApprovalStatus } from 'src/shared/enums';
import { EmailService } from 'src/email/email.service';
import { Organization } from 'src/organization/models/organization.model';
import { generateHashedOtp, generateOTP } from 'src/shared/utils/otp.utils';
import { NotificationChannel } from 'src/notifications/enums/notification-channel.enum';
import { NotificationDispatcherService } from 'src/notifications/services/notification-dispatcher.service';
import {
  checkOtpBlocked,
  clearOtpAttempts,
  recordFailedOtpAttempt,
} from 'src/shared/utils/otp-attempt-tracker';
import { EventLogService } from 'src/eventlog/eventlog.service';

@Injectable()
export class ProfileService {
  private logger = new Logger(ProfileService.name);

  constructor(
    @InjectModel(Profile)
    private profileModel: typeof Profile,
    @InjectModel(Employee) private employeeModel: typeof Employee,
    @InjectModel(Authentication)
    private authModel: typeof Authentication,
    @InjectModel(ApprovalRequest)
    private approvalRequestModel: typeof ApprovalRequest,
    @InjectModel(VendorUser)
    private vendorUserModel: typeof VendorUser,
    private readonly sequelize: Sequelize,
    private config: ConfigService,
    private uploadService: UploadService,
    private configurationService: ConfigurationService,
    private emailService: EmailService,
    @InjectModel(Organization)
    private organizationModel: typeof Organization,
    private readonly notificationDispatcher: NotificationDispatcherService,
    private readonly eventLogService: EventLogService,
  ) {}

  async create(
    profileInput,
    transaction?: Transaction,
  ): Promise<GenericResponse<Profile>> {
    try {
      const profiles = await this.profileModel.create(
        {
          ...profileInput,
        },
        { transaction },
      );
      return {
        message: 'Profile created successfully',
        data: profiles,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<Profile>> {
    try {
      const profile = await this.profileModel.findOne({
        where: { id },
      });
      if (profile)
        return {
          message: 'Profile found',
          data: profile,
        };
      else throw new NotFoundException('Invalid profile Id');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async update(profileInput): Promise<any> {
    try {
      const profile = await this.profileModel.findOne({
        where: { employeeID: profileInput.employeeID },
      });

      if (!profile) {
        throw new NotFoundException('Profile not found');
      }

      await profile.update(profileInput);

      return {
        message: 'Profile updated successfully',
        data: profile,
      };
    } catch (error) {
      throw error;
    }
  }

  // async updateUserProfile(
  //   user: any,
  //   updateProfileInput: UpdateProfileInput,
  //   file: Express.Multer.File,
  // ): Promise<any> {
  //   const transaction = await this.sequelize.transaction();

  //   try {
  //     const profile = await this.profileModel.findOne({
  //       where: { employeeID: user.employeeID },
  //       transaction,
  //     });
  //     if (!profile) {
  //       throw new NotFoundException('Profile not found');
  //     }

  //     let fileUrl: string | null = null;

  //     if (file) {
  //       const fileDetails = {
  //         Key: `${file.originalname}`,
  //         Body: file.buffer,
  //         Bucket: `${this.config.get('AWSBUCKETNAME')}/profile_image`,
  //         ACL: 'public-read',
  //         ContentType: file.mimetype,
  //       };

  //       fileUrl = await this.uploadService.uploadDocument(fileDetails);
  //     }

  //     const updatedProfileData = {
  //       ...updateProfileInput,
  //       ...(fileUrl && { image: fileUrl }),
  //     };

  //     await profile.update(updatedProfileData, { transaction });
  //     const updateEmployeeInput = {
  //       name: updateProfileInput.name,
  //       email: updateProfileInput.email,
  //       phone: updateProfileInput.phone,
  //       address: updateProfileInput.address,
  //       gender: updateProfileInput.gender,
  //       landmark: updateProfileInput.landmark,
  //     };
  //     const validationEmployeeErrors = await uniqueFieldsCheck(
  //       this.employeeModel,
  //       ['email', 'phone'],
  //       updateEmployeeInput,
  //       user?.employeeID,
  //       user?.orgID,
  //     );
  //     handleErrors(validationEmployeeErrors, 'unique');
  //     await this.employeeModel.update(
  //       updateEmployeeInput,
  //       // {
  //       //   name: updateProfileInput.name,
  //       //   email: updateProfileInput.email,
  //       //   phone: updateProfileInput.phone,
  //       //   address: updateProfileInput.address,
  //       //   gender: updateProfileInput.gender,
  //       //   landmark: updateProfileInput.landmark,
  //       // },
  //       {
  //         where: { id: user.employeeID },
  //         transaction,
  //       },
  //     );
  //     const validationErrors = await uniqueFieldsCheck(
  //       this.authModel,
  //       ['email', 'phone'],
  //       {
  //         email: updateProfileInput.email,
  //         phone: updateProfileInput.phone,
  //       },
  //       user.id,
  //       null,
  //     );
  //     handleErrors(validationErrors, 'unique');
  //     await this.authModel.update(
  //       {
  //         name: updateProfileInput.name,
  //         email: updateProfileInput.email,
  //         phone: updateProfileInput.phone,
  //       },
  //       {
  //         where: { employeeID: user.employeeID },
  //         transaction,
  //       },
  //     );

  //     await transaction.commit();

  //     // Reload updated profile to reflect changes
  //     //   await profile.reload();

  //     return {
  //       message: 'Profile updated successfully',
  //       data: profile,
  //     };
  //   } catch (error) {
  //     await transaction.rollback();
  //     throw error;
  //   }
  // }

  async updateUserProfile(
    user: any,
    updateProfileInput: UpdateProfileInput,
    file: Express.Multer.File,
  ): Promise<any> {
    const transaction = await this.sequelize.transaction();

    try {
      const profile = await this.profileModel.findOne({
        where: { employeeID: user.employeeID },
        transaction,
        include: [
          {
            model: Employee,
            attributes: [
              'name',
              'email',
              'gender',
              'phone',
              'homePoint',
              'employeeType',
            ],
          },
        ],
      });
      if (!profile) {
        throw new NotFoundException('Profile not found');
      }

      const isAdmin = profile.employee?.employeeType === 'Admin';
      let employeeApprovalEnabled = false;

      if (!isAdmin) {
        employeeApprovalEnabled =
          (await this.configurationService.getConfigValue(
            'Approval Request',
            user.orgID,
          )) === 'Yes';
      }

      // image is only ever written from an uploaded file below. The client echoes
      // the GET's image URL back as a plain body field, and reads are now
      // presigned, so without this an expiring URL would be persisted.
      delete updateProfileInput.image;

      let fileUrl: string | null = null;

      if (file) {
        const fileDetails = {
          Key: `${file.originalname}`,
          Body: file.buffer,
          Bucket: `${this.config.get('AWSBUCKETNAME')}/profile_image`,
          ContentType: file.mimetype,
        };

        fileUrl = await this.uploadService.uploadDocument(fileDetails);
      }

      const updatedProfileData = {
        ...updateProfileInput,
        ...(fileUrl && { image: fileUrl }),
      };
      const normalizeValue = (key: string, value: any) => {
        if (!value) return value;
        if (key === 'dob') {
          return new Date(value).toISOString().split('T')[0];
        }
        return value;
      };
      const incomingData = {
        ...updateProfileInput,
        ...(fileUrl && { image: fileUrl }),
      };

      // Diff computed once, up front, and reused for both the
      // ApprovalRequest's oldRecord/newRecord AND the event log's
      // changeJSON, whichever branch below actually runs. Previously
      // only computed inside the approval-enabled branch, so this event
      // log couldn't be built at all for the direct-update path.
      const oldRecord: Record<string, any> = {};
      const newRecord: Record<string, any> = {};
      const currentData = {
        ...profile.get({ plain: true }),
        ...profile.employee?.get({ plain: true }),
      };
      for (const key of Object.keys(incomingData)) {
        if (key === 'file') continue;
        const oldValue = normalizeValue(key, currentData[key]);
        const newValue = normalizeValue(key, incomingData[key]);

        if (oldValue !== newValue) {
          oldRecord[key] = oldValue;
          newRecord[key] = newValue;
        }
      }
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      for (const key of Object.keys(newRecord)) {
        changeJSON[key] = {
          OldValue: oldRecord[key],
          newValue: newRecord[key],
        };
      }

      if (employeeApprovalEnabled) {
        await this.approvalRequestModel.create(
          {
            requestedBy: 'Employee',
            employeeID: user.employeeID,
            orgID: user.orgID,
            oldRecord,
            newRecord,
            status: 'Pending',
          },
          { transaction },
        );
        const organization = await this.organizationModel.findOne({
          where: { id: user.orgID },
          attributes: ['email', 'name'],
        });

        if (organization?.email && newRecord.homePoint) {
          const alertEmailsRaw = await this.configurationService.getConfigValue(
            'HomePoint Change Email Alert',
            user.orgID,
          );
          const extraEmails = alertEmailsRaw
            ? alertEmailsRaw
                .split(',')
                .map((e) => e.trim())
                .filter(Boolean)
            : [];
          const mailTo = [...new Set([organization.email, ...extraEmails])];

          await this.emailService.sendEmail({
            mailTo,
            subject: 'Employee Home Geocode Change Request',
            templateName: 'approval-request',
            mailBody: {
              employeeName: profile.employee?.name,
              oldRecord,
              newRecord,
              deepLink: `${this.config.get(
                'ADMIN_VERIFY_URL',
              )}/approval-request?tab=pending`,
            },
            isAttachments: false,
            attachments: [],
          });
        }

        // Profile row itself hasn't changed yet — only the ApprovalRequest
        // was created — so this records "requested" rather than "edit",
        // mirroring the two-branch pattern used for employeeChangeHomePoint().
        await this.eventLogService.create(
          {
            objectType: 'Profile',
            changeType: 'edit',
            objectID: user.employeeID,
            authID: user.id,
            orgID: user.orgID,
            updatedBy: user.name,
            payload: {
              employeeID: user.employeeID,
              approvalRequired: true,
            },
            requestPayload: incomingData,
            changeJSON,
            customDescription: 'requested profile update (pending approval)',
            user,
          },
          transaction,
        );

        await transaction.commit();

        return {
          message: 'Profile update request sent for approval.',
        };
      }
      await profile.update(updatedProfileData, { transaction });
      const updateEmployeeInput: any = {
        name: updateProfileInput?.name,
        email: updateProfileInput?.email,
        phone: updateProfileInput?.phone,
        gender: updateProfileInput?.gender,
        landmark: updateProfileInput?.landmark,
        address: updateProfileInput?.address,
        homePoint: updateProfileInput?.homePoint,
        designation: updateProfileInput?.designation,
      };
      const validationEmployeeErrors = await uniqueFieldsCheck(
        this.employeeModel,
        ['email', 'phone'],
        updateEmployeeInput,
        user?.employeeID,
        user?.orgID,
      );
      handleErrors(validationEmployeeErrors, 'unique');
      await this.employeeModel.update(updateEmployeeInput, {
        where: { id: user.employeeID },
        transaction,
      });
      const validationErrors = await uniqueFieldsCheck(
        this.authModel,
        ['email', 'phone'],
        {
          email: updateProfileInput.email,
          phone: updateProfileInput.phone,
        },
        user.id,
        null,
      );
      handleErrors(validationErrors, 'unique');
      await this.authModel.update(
        {
          name: updateProfileInput.name,
          email: updateProfileInput.email,
          phone: updateProfileInput.phone,
        },
        {
          where: { employeeID: user.employeeID },
          transaction,
        },
      );

      await this.eventLogService.create(
        {
          objectType: 'Profile',
          changeType: 'edit',
          objectID: user.employeeID,
          authID: user.id,
          orgID: user.orgID,
          updatedBy: user.name,
          payload: {
            employeeID: user.employeeID,
            approvalRequired: false,
          },
          requestPayload: incomingData,
          changeJSON,
          customDescription: 'updated Profile',
          user,
        },
        transaction,
      );

      await transaction.commit();

      return {
        message: 'Profile updated successfully',
        data: profile,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async cancelProfileUpdateRequest(user: any): Promise<GenericResponse<any>> {
    try {
      const approvalRequest = await this.approvalRequestModel.findOne({
        where: {
          orgID: user.orgID,
          employeeID: user.employeeID,
          status: ApprovalStatus.Pending,
        },
      });
      if (!approvalRequest) {
        return {
          status: false,
          message: 'No pending update request found',
        };
      }
      await approvalRequest.update({ status: ApprovalStatus.Cancelled });
      return {
        status: true,
        message: 'Update request cancelled successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  async updateVendorProfile(
    user,
    updateProfileInput: UpdateProfileInput,
    file: any,
  ): Promise<any> {
    try {
      const vendorProfile = await this.vendorUserModel.findOne({
        where: { id: user.vendorUserID },
      });
      if (!vendorProfile) {
        throw new NotFoundException('Vendor not found');
      }
      // image is only ever written from an uploaded file below. updateProfileInput
      // is passed to .update() unfiltered, so an echoed presigned URL would land
      // in the column as-is.
      delete updateProfileInput.image;

      let fileUrl: string | null = null;
      if (file) {
        const fileDetails = {
          Key: `${file?.originalname}`,
          Body: file?.buffer,
          Bucket: `${this.config.get('AWSBUCKETNAME')}/vendor_profile_image`,
          ContentType: file?.mimetype,
        };
        fileUrl = await this.uploadService.uploadDocument(fileDetails);
        updateProfileInput.image = fileUrl;
      }
      await vendorProfile.update(updateProfileInput);
      await this.authModel.update(
        {
          name: updateProfileInput.name,
          email: updateProfileInput.email,
          phone: updateProfileInput.phone,
        },
        {
          where: { vendorUserID: user.vendorUserID },
        },
      );
      return {
        message: 'Profile updated successfully',
        data: vendorProfile,
      };
    } catch (error) {
      throw error;
    }
  }

  async updateGuestEmployee(employeeID, updateEmployeeData): Promise<any> {
    try {
      const updatedEmployee = await this.employeeModel.update(
        {
          homePoint: updateEmployeeData?.homePoint,
          address: updateEmployeeData?.address,
        },
        {
          where: { id: employeeID, orgID: updateEmployeeData?.orgID },
        },
      );
      return {
        message: 'Data updated successfully',
        data: updatedEmployee,
      };
    } catch (error) {
      throw error;
    }
  }
  async findOneProfileForEmpID(
    empID: string,
  ): Promise<GenericResponse<Profile>> {
    try {
      const profile = await this.profileModel.findOne({
        where: { employeeID: empID },
      });
      if (profile)
        return {
          message: 'Profile found',
          data: profile,
        };
      else throw new NotFoundException('Invalid profile Id');
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async sendPinResetOtp(user: any): Promise<GenericResponse<any>> {
    const employee = await this.employeeModel.findOne({
      where: {
        id: user.employeeID,
      },
      include: [
        {
          model: Profile,
          as: 'profileInput',
        },
      ],
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const otp = generateOTP();
    const hashedOtp = await generateHashedOtp(otp);
    await employee.profileInput.update({
      pinResetHashedOtp: hashedOtp,
      pinResetOtpCreatedAt: new Date(),
    });

    const payloadSms = {
      organizationId: String(employee.orgID),
      event: 'security-pin.reset.otp',
      queue: false,
      recipient: {
        phoneNumber: `91${employee.phone}`,
        firstName: employee.name,
        email: employee.email,
        id: String(employee.id),
      },
      data: {
        firstName: employee.name,
        otp,
      },
      channels: [NotificationChannel.SMS],
      locale: 'en',
      empID: String(employee.id),
    };

    await this.notificationDispatcher.notify(payloadSms);

    return {
      status: true,
      message: 'OTP has been sent to your registered phone number.',
    };
  }

  // async verifyPinResetOtp(
  //   user: any,
  //   otp: string,
  // ): Promise<GenericResponse<any>> {
  //   try {
  //     const employee = await this.employeeModel.findOne({
  //       where: {
  //         id: user.employeeID,
  //       },
  //       include: [
  //         {
  //           model: Profile,
  //           as: 'profileInput',
  //         },
  //       ],
  //     });
  //     if (!employee) {
  //       throw new NotFoundException('Employee not found');
  //     }

  //     const profile = employee.profileInput;
  //     if (profile?.pinResetHashedOtp === null) {
  //       throw new BadRequestException(
  //         'Incorrect OTP. Please request a new OTP.',
  //       );
  //     }
  //     const otpExpiryTime = 5 * 60 * 1000; // 5 minutes
  //     const otpExpiryCheck =
  //       Date.now() - new Date(profile.pinResetOtpCreatedAt).getTime();

  //     if (otpExpiryCheck > otpExpiryTime) {
  //       throw new BadRequestException(
  //         'OTP has expired. Please request a new one.',
  //       );
  //     }

  //     if (!(await bcrypt.compare(otp, profile.pinResetHashedOtp))) {
  //       throw new BadRequestException('Incorrect OTP.');
  //     }
  //     console.log("OTP was CORRECT — about to reset rate limit for:", user.employeeID);
  //     // Optional: Clear OTP after successful verification
  //     await profile.update({
  //       pinResetHashedOtp: null,
  //       pinResetOtpCreatedAt: null,
  //     });
  //     // Correct OTP — clear this employee's rate-limit bucket so their
  //     // next PIN-reset flow starts fresh at "3 free attempts" again.
  //     await resetRateLimitEntry(
  //       'POST',
  //       '/user-profile/verify-pin-reset-otp', // must match the route's full path exactly
  //       String(user.employeeID),
  //     );
  //     console.log("resetRateLimitEntry call completed");
  //     return {
  //       status: true,
  //       message: 'OTP verified successfully.',
  //     };
  //   } catch (error: any) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  // import { checkOtpBlocked, recordFailedOtpAttempt, clearOtpAttempts } from './otp-attempt-tracker';

  async verifyPinResetOtp(
    user: any,
    otp: string,
  ): Promise<GenericResponse<any>> {
    try {
      const identifier = String(user.employeeID);

      const { blocked, retryAfterSec } = checkOtpBlocked(identifier);
      if (blocked) {
        const retryAfterMin = Math.ceil((retryAfterSec ?? 0) / 60);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Too many attempts. Please try again after ${retryAfterMin} minute${
              retryAfterMin === 1 ? '' : 's'
            }.`,
            retryAfter: retryAfterSec,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const employee = await this.employeeModel.findOne({
        where: { id: user.employeeID },
        include: [{ model: Profile, as: 'profileInput' }],
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      const profile = employee.profileInput;
      if (profile?.pinResetHashedOtp === null) {
        throw new BadRequestException(
          'Incorrect OTP. Please request a new OTP.',
        );
      }

      const otpExpiryTime = 5 * 60 * 1000;
      const otpExpiryCheck =
        Date.now() - new Date(profile.pinResetOtpCreatedAt).getTime();
      if (otpExpiryCheck > otpExpiryTime) {
        throw new BadRequestException(
          'OTP has expired. Please request a new one.',
        );
      }

      const isCorrect = await bcrypt.compare(otp, profile.pinResetHashedOtp);

      if (!isCorrect) {
        recordFailedOtpAttempt(identifier);
        throw new BadRequestException('Incorrect OTP.');
      }

      // Correct OTP — clear attempt history so the next reset flow starts fresh
      clearOtpAttempts(identifier);

      await profile.update({
        pinResetHashedOtp: null,
        pinResetOtpCreatedAt: null,
      });

      return {
        status: true,
        message: 'OTP verified successfully.',
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
