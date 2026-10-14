import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Authentication } from '../models/authentication.model';
import { AuthenticationUserInput } from '../dtos/authentication-input.dto';
import { UpdateAuthenticationInput } from '../dtos/update-authentication-input.dto';
import { AdminUserFilterInput } from '../dtos/admin-user-filter-input.dto';
import { SortOrder, UserType } from 'src/shared/enums';
import { AuthService } from './auth.service';
import { Op } from 'sequelize';
import { PasswordService } from 'src/password-management/password/services/password.service';
import { PasswordHistoryService } from 'src/password-management/password-history/services/password-history.service';
import { SessionService } from './session.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Authentication)
    private authenticationModel: typeof Authentication,
    private authService: AuthService,
    private passwordService: PasswordService,
    private passwordHistoryService: PasswordHistoryService,
    private sessionService: SessionService,
  ) {}

  async create(
    createAdminUserInput: AuthenticationUserInput,
  ): Promise<GenericResponse<Authentication>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.authenticationModel,
        ['email', 'phone'],
        createAdminUserInput,
      );

      handleErrors(validationErrors, 'unique');

      const isStrong = await this.passwordService.isPasswordStrong(
        createAdminUserInput.password,
      );
      if (!isStrong.error) {
        throw new BadRequestException(isStrong.message);
      }

      const hashedPassword = await this.authService.generateHashedPassword(
        createAdminUserInput.password,
      );
      const userInput = {
        ...createAdminUserInput,
        hashedPassword,
        name: 'SuperAdmin',
      };
      const user = await this.authenticationModel.create(userInput);
      // Store history
      await this.passwordHistoryService.addPasswordHistory(
        hashedPassword,
        null, // employeeID → null for superAdmin
        user.id, // authID → use the created auth record's ID
      );
      return {
        message: 'User created successfully',
        data: user,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    adminUserFilterInput: AdminUserFilterInput,
  ): Promise<PaginatedList<Authentication>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = adminUserFilterInput;

      let whereClause: any = { userType: UserType.SuperAdmin };

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
      const users = await this.authenticationModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      return {
        totalItems: users.count,
        items: users.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<Authentication>> {
    try {
      const adminUser = await this.authenticationModel.findOne({
        where: { id },
      });
      if (adminUser)
        return {
          message: 'Admin found',
          data: adminUser,
        };
      else throw new NotFoundException('Invalid admin Id');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateAuthenticationInput: UpdateAuthenticationInput,
  ): Promise<any> {
    try {
      // const hashedPassword = await this.authService.generateHashedPassword(
      //   updateAuthenticationInput.password,
      // );
      // const userInput = { ...updateAuthenticationInput, hashedPassword };
      const validationErrors = await uniqueFieldsCheck(
        this.authenticationModel,
        ['email', 'phone'],
        updateAuthenticationInput,
        id,
      );

      handleErrors(validationErrors, 'unique');
      // Fetch existing user to compare phone/email before update
      const existingUser = await this.authenticationModel.findOne({
        where: { id },
        attributes: ['phone', 'email'],
      });
      const updatedUser = await this.authenticationModel.update(
        updateAuthenticationInput,
        {
          where: { id },
          returning: true,
        },
      );
      // Only invalidate session if phone or email was changed
      const phoneChanged =
        updateAuthenticationInput.phone &&
        updateAuthenticationInput.phone !== existingUser?.phone;
      const emailChanged =
        updateAuthenticationInput.email &&
        updateAuthenticationInput.email !== existingUser?.email;
      if (phoneChanged || emailChanged) {
        await this.sessionService.invalidate(id);
      }
      const userData = updatedUser?.[1]?.[0];
      const updatedResponse = {
        id: userData?.id,
        updatedAt: userData?.updatedAt,
      };
      return {
        message: 'Admin  updated successfully',
        data: updatedResponse,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async softDelete(id: string): Promise<GenericResponse<null>> {
    try {
      await this.findOne(id);
      await this.authenticationModel.destroy({
        where: {
          id,
        },
      });

      return {
        message: 'Admin  deleted successfully',
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
