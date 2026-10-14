import * as bcrypt from 'bcryptjs';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CreateAdminInput } from '../dtos/create-administrator-input.dto';
import { UpdateAdministratorInput } from '../dtos/update-administrator-input.dto';
import { InjectModel } from '@nestjs/sequelize';
import { SortOrder, UserType } from 'src/shared/enums';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Administrator } from '../models/administrator.model';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Op } from 'sequelize';
import { UserService } from 'src/user/services/user.service';

import { AdministratorFilterInput } from '../dtos/administrator-filter-input.dto';
import { Sequelize } from 'sequelize-typescript';
import { Role } from 'src/role/models/role.model';
import { User } from 'src/user/models/user.model';
import { UpdateAdministratorPermissionsInput } from '../dtos/update-admin-permissions-input.dto';

@Injectable()
export class AdministratorService {
  private logger = new Logger(AdministratorService.name);
  constructor(
    @InjectModel(Administrator)
    private adminModel: typeof Administrator,
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
    @Inject(forwardRef(() => UserService))
    private readonly sequelize: Sequelize,
  ) {}

  async create(
    createAdminInput: CreateAdminInput,
  ): Promise<GenericResponse<Administrator>> {
    const transaction = await this.sequelize.transaction();

    try {
      const validationErrors = await uniqueFieldsCheck(
        this.adminModel,
        ['email', 'phone'],
        createAdminInput,
      );

      handleErrors(validationErrors, 'unique');
      const hashedPassword = await this.generateHashedPassword(
        createAdminInput.password,
      );
      const user = await this.userService.create(
        {
          phone: createAdminInput.phone,
          email: createAdminInput.email,
          userType: UserType.Admin,
          roleID: createAdminInput.roleID,
        },
        hashedPassword,
        transaction,
      );

      if (user) {
        const administrator = await this.adminModel.create(
          {
            ...createAdminInput,
            email: createAdminInput.email,
            userID: user?.id,
            roleID: createAdminInput.roleID, //check role assign permission for creating user
          },
          { transaction },
        );
        await transaction.commit();
        return {
          message: 'User created successfully',
          data: administrator,
        };
      }
    } catch (error) {
      await transaction.rollback();
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    administratorFilterInput: AdministratorFilterInput,
  ): Promise<PaginatedList<Administrator>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = administratorFilterInput;

      let whereClause: any = {};
      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            {
              fullName: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              email: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              phone: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }

      const administrators = await this.adminModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id'],
            // where: {
            //   userType: UserType.Admin,
            // },
          },
        ],
      });
      return {
        totalItems: administrators.count,
        items: administrators.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<Administrator>> {
    try {
      const administrator = await this.adminModel.findOne({
        where: { id },
        subQuery: false,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['roleID', 'permissions'],
            include: [
              {
                model: Role,
                attributes: ['name'],
                required: false,
              },
            ],
          },
        ],
      });
      if (administrator)
        return {
          message: 'Administrator found',
          data: administrator,
        };
      else throw new NotFoundException('Invalid User id');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateAdministratorInput: UpdateAdministratorInput,
  ): Promise<any> {
    try {
      const administrator = await this.findOne(id);

      const validationErrors = await uniqueFieldsCheck(
        this.adminModel,
        ['phone'],
        updateAdministratorInput,
        id,
      );
      handleErrors(validationErrors, 'unique');

      updateAdministratorInput.phone = updateAdministratorInput.phone
        ? updateAdministratorInput.phone
        : null;

      const updatedAdministrator = await this.adminModel.update(
        updateAdministratorInput,
        {
          where: { id },
          returning: true,
        },
      );
      await this.userService.update(administrator?.data?.userID?.toString(), {
        // email: updateAdministratorInput?.email,
        phone: updateAdministratorInput?.phone,
        userType: UserType.Admin,
        roleID: updateAdministratorInput?.roleID,
      });

      return {
        status: true,
        message: 'User updated successfully',
        data: updatedAdministrator?.[1]?.[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  //check if role assigned to anu Administrator
  async findUserWithRole(id: string): Promise<boolean> {
    try {
      const user = await this.adminModel.findOne({
        where: {
          roleID: id,
        },
      });
      if (user) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async softDelete(id: string): Promise<GenericResponse<null>> {
    try {
      const administrator = await this.findOne(id);
      await this.adminModel.destroy({
        where: {
          id,
        },
      });
      await this.userService.softDelete(administrator?.data?.userID);
      return {
        message: 'User deleted successfully',
        data: null,
      };
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

  async updatePermissions(
    id: string,
    updateAdministratorPermissionsInput: UpdateAdministratorPermissionsInput,
  ): Promise<any> {
    try {
      const administrator = await this.findOne(id);

      await this.userService.updatePermissions(
        administrator?.data?.userID?.toString(),
        updateAdministratorPermissionsInput?.permissions,
      );

      return {
        status: true,
        message: 'User permissions updated successfully',
        data: true,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
