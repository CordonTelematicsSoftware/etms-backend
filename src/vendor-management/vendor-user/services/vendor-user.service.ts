import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { VendorUser } from '../models/vendor-user.model';
import { CreateVendorUserInput } from '../dtos/create-vendor-user-input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import {
  formatExceptions,
  handleErrors,
} from 'src/shared/utils/format-exception';
import { VendorUserFilterInput } from '../dtos/vendor-user-filter-input.dto';
import {
  EndPoint,
  RequestStatus,
  SortOrder,
  Status,
  UserType,
} from 'src/shared/enums';
import { Op } from 'sequelize';
import { UpdateVendorUserInput } from '../dtos/update-vendor-user-input.dto';
import { AuthService } from 'src/auth/services/auth.service';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Session } from 'src/auth/models/session.model';
import { VendorRequest } from 'src/vendor-management/vendor-request/models/vendor-request.model';
import { PasswordService } from 'src/password-management/password/services/password.service';
import { PasswordHistoryService } from 'src/password-management/password-history/services/password-history.service';
// import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Injectable()
export class VendorUserService {
  constructor(
    @InjectModel(VendorUser)
    private vendorUserModel: typeof VendorUser,
    @InjectModel(Session)
    private sessionModel: typeof Session,
    @InjectModel(VendorRequest)
    private vendorRequestModel: typeof VendorRequest,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
    private eventlogService: EventLogService,
    private passwordService: PasswordService,
    private passwordHistoryService: PasswordHistoryService,
  ) {}
  async create(
    createVendorUserInput: CreateVendorUserInput,
    currentUser?: any,
    transaction?: any,
  ): Promise<GenericResponse<VendorUser>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.vendorUserModel,
        ['name', 'email', 'phone'],
        createVendorUserInput,
      );
      const formatted = formatExceptions(validationErrors, 'unique');
      const mappedErrors: any = {};
      if (formatted.email) {
        mappedErrors.vendorUserEmail = 'Admin email already exists';
      }
      if (formatted.phone) {
        mappedErrors.vendorUserPhone = 'Admin phone already exists';
      }
      if (formatted.name) {
        mappedErrors.vendorUserName = 'Admin name already exists';
      }
      if (Object.keys(mappedErrors).length) {
        throw new BadRequestException(mappedErrors);
      }
      handleErrors(validationErrors, 'unique');
      // console.log('------------------createVendorUserInput--------', createVendorUserInput)
      handleErrors(validationErrors, 'unique');

      //  Step 1 — Check password strength (only if password provided) newly added for password and isPasswordStrong check, rest of the code is already there.
      if (createVendorUserInput.password) {
        const isStrong = await this.passwordService.isPasswordStrong(
          createVendorUserInput.password,
        );
        if (!isStrong.error) {
          throw new BadRequestException(isStrong.message);
        }
      }

      const vendorUser = await this.vendorUserModel.create(
        {
          ...createVendorUserInput,
        },
        { transaction },
      );
      const authInput = {
        name: createVendorUserInput?.name,
        phone: createVendorUserInput?.phone,
        email: createVendorUserInput?.email,
        userType: UserType.Vendor,
        status: Status.Active,
        password: createVendorUserInput.password ?? null,
        passwordCreatedAt: createVendorUserInput.password ? new Date() : null,
        vendorID: createVendorUserInput.vendorID,
        vendorUserID: vendorUser?.id,
      };
      // Pre-check Authentication table for email/phone conflicts
      const authValidationErrors = await uniqueFieldsCheck(
        this.authService['authModel'],
        ['email', 'phone'],
        createVendorUserInput,
      );
      const authFormatted = formatExceptions(authValidationErrors, 'unique');
      const authMappedErrors: any = {};
      if (authFormatted.email) {
        authMappedErrors.vendorUserEmail = 'Admin email already exists';
      }
      if (authFormatted.phone) {
        authMappedErrors.vendorUserPhone = 'Admin phone already exists';
      }
      if (Object.keys(authMappedErrors).length) {
        throw new BadRequestException(authMappedErrors);
      }

      const authUser = await this.authService.create(authInput, transaction);
      if (currentUser?.userType !== UserType.SuperAdmin) {
        await this.authService.generateResetPasswordLinkAndSendMail(
          authUser?.id?.toString(),
          {
            ...authUser?.[
              authUser.userType === UserType.Admin ? 'admin' : 'Vendor'
            ]?.dataValues,
            email: authUser?.email,
          },
          authUser.userType,
          'email-verification',
          authUser?.email,
          EndPoint.Vendor,
        );
      }
      // Step 2 — Save password history after auth record is created. Only this step 1,2 added newly for password and isPasswordStrong check, rest of the code is already there.
      if (createVendorUserInput.password) {
        const hashedPassword = authUser.hashedPassword; // already hashed inside authService.create()
        await this.passwordHistoryService.addPasswordHistory(
          hashedPassword,
          null, // employeeID → null for vendor user
          authUser.id, // authID → use created auth record's ID
          transaction,
        );
      }
      const eventPayload = JSON.parse(JSON.stringify(createVendorUserInput));
      const eventLog = {
        objectType: 'VendorUser',
        changeType: 'add',
        objectID: vendorUser.id,
        authID: currentUser.id,
        updatedBy: currentUser.name,
        payload: vendorUser,
        requestPayload: eventPayload,
        user: currentUser,
      };
      this.eventlogService.create(eventLog, transaction);

      return {
        message: 'Vendor user created successfully',
        data: vendorUser,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async vendorSwitchingOrg(
    id: string,
    user: any,
    token: any,
  ): Promise<GenericResponse<null>> {
    const approvedOrg = await this.vendorRequestModel.findOne({
      where: {
        vendorID: user.vendorID,
        orgID: id,
        requestStatus: RequestStatus.Approved,
      },
    });
    if (!approvedOrg) {
      return {
        status: false,
        message: 'You do not have access to this organization',
      };
    }
    const updateSessionInput = {
      orgID: id,
    };
    await this.sessionModel.update(updateSessionInput, {
      where: {
        token: token,
        invalidated: false,
      },
    });

    const updatedSession = await this.sessionModel.findOne({
      where: { token: token, invalidated: false },
    });

    if (updatedSession) {
      user.orgID = updatedSession.orgID;
    }
    return {
      status: true,
      message: 'Organization switched successfully',
    };
  }

  async findAll(
    vendorUserFilterInput: VendorUserFilterInput,
  ): Promise<PaginatedList<VendorUser>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        vendorID,
      } = vendorUserFilterInput;
      let whereClause: any = {};

      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }
      whereClause.vendorID = vendorID;

      const vendorUser = await this.vendorUserModel.findAndCountAll({
        attributes: ['name', 'id', 'email', 'phone'],
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });

      return {
        totalItems: vendorUser.count,
        items: vendorUser.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<VendorUser>> {
    try {
      const vendorUser = await this.vendorUserModel.findOne({
        where: { id },
      });
      if (vendorUser)
        return {
          message: 'Vendor found',
          data: vendorUser,
        };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateVendorUserInput: UpdateVendorUserInput,
    user: any,
  ): Promise<any> {
    try {
      const { name } = updateVendorUserInput;
      const existingVendorUser = await this.vendorUserModel.findOne({
        where: {
          name: name,
          id: { [Op.ne]: id },
        },
      });

      if (existingVendorUser) {
        throw new NotFoundException('A vendor with this name already exists.');
      }
      const updateData = { ...updateVendorUserInput };
      // image is only ever written from an uploaded file. UpdateVendorUserInput
      // does not declare it, but whitelist is off (main.ts:60-61) so a
      // client-sent value would otherwise reach the column.
      delete (updateData as any).image;

      const vendorUser = await this.vendorUserModel.update(updateData, {
        where: { id },
        returning: true,
      });
      const eventPayload = JSON.parse(JSON.stringify(updateVendorUserInput));
      const eventLog = {
        objectType: 'VendorUser',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        payload: existingVendorUser,
        requestPayload: eventPayload,
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: 'Vendor user updated successfully',
        data: vendorUser?.[1]?.[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async delete(id: string): Promise<GenericResponse<null>> {
    try {
      await this.vendorUserModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'Vendor user deleted successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
