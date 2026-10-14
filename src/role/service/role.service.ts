import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from '../models/role.model';
import { RoleInputDto } from '../dtos/role-input.dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { uniqueCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { EmployeeType, SortOrder, UserType } from 'src/shared/enums';
import { Op } from 'sequelize';
import { RoleFilterInput } from '../dtos/role-filter-input.dto';
import { UserService } from 'src/user/services/user.service';
import { Organization } from 'src/organization/models/organization.model';
import { Sequelize } from 'sequelize-typescript';
import { EventLogService } from 'src/eventlog/eventlog.service';

@Injectable()
export class RoleService {
  constructor(
    @InjectModel(Role) private roleModel: typeof Role,
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
    private eventlogService: EventLogService,
  ) {}

  async createRole(
    roleInputDto: RoleInputDto,
    user: any,
  ): Promise<GenericResponse<Role>> {
    try {
      let validationErrors: any[] = [];
      if (user.userType === UserType.SuperAdmin) {
        validationErrors = await Promise.all([
          uniqueCheck(this.roleModel, 'name', roleInputDto.name),
        ]);
      } else {
        const existingRole = await this.roleModel.findOne({
          where: {
            name: roleInputDto?.name,
            orgID: user?.orgID,
          },
        });

        if (existingRole) {
          validationErrors.push({
            fieldName: 'name',
            error: true,
          });
        }
      }
      handleErrors(validationErrors, 'unique');

      let orgID = null;
      if (user.userType !== UserType.SuperAdmin) {
        orgID = user?.orgID;
      }
      const role = await this.roleModel.create({
        name: roleInputDto.name,
        permissions: roleInputDto.permissions,
        enabled: roleInputDto.enabled,
        orgID: orgID,
        employeeType:
          user?.userType === UserType.SuperAdmin
            ? null
            : roleInputDto.employeeType,
      });
      if (!role) {
        return {
          message: 'Role not created, something went wrong!',
          data: null,
        };
      }

      this.eventlogService.create({
        objectType: 'Role',
        changeType: 'add',
        objectID: role.id,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: {
          roleID: role.id,
          name: role.name,
          enabled: role.enabled,
          employeeType: role.employeeType,
          permissions: Array.isArray(role.permissions)
            ? role.permissions.join(', ')
            : role.permissions,
        },
        requestPayload: JSON.parse(JSON.stringify(roleInputDto)),
        customDescription: `created new Role "${role.name}"`,
        user,
      });

      return {
        message: 'Role created successfully',
        data: role,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getRoles(
    roleFilterInput: RoleFilterInput,
    user: any,
  ): Promise<PaginatedList<Role>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        enabled,
        employeeType,
      } = roleFilterInput;

      let whereClause: any = {};
      if (employeeType) {
        if (employeeType === EmployeeType.Transportation) {
          whereClause.employeeType = {
            [Op.in]: [EmployeeType.Transportation, EmployeeType.Security],
          };
        } else {
          whereClause.employeeType = employeeType;
        }
      }

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

      if (user.userType !== 'SuperAdmin') {
        whereClause.orgID = user?.orgID;
        whereClause.id = { [Op.ne]: user?.roleID };
      }
      if (user.userType === 'SuperAdmin') {
        whereClause.employeeType = null;
      }

      if (enabled) {
        whereClause = {
          ...whereClause,
          enabled: true,
        };
      }
      const roles = await this.roleModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
        include: [
          {
            model: Organization,
            as: 'organization',
            attributes: [
              'id',
              [Sequelize.literal('"organization"."name"'), 'organization'],
            ],
          },
        ],
      });
      return {
        totalItems: roles.count,
        items: roles.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getRoleById(id: string, user?: any): Promise<GenericResponse<Role>> {
    try {
      const role = await this.roleModel.findOne({
        where: { id, orgID: user?.orgID },
      });
      if (role) {
        return {
          message: 'Role found',
          data: role,
        };
      } else {
        throw new BadRequestException('No role found.');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async updateRole(
    id: string,
    updateRoleInput: RoleInputDto,
    user?: any,
  ): Promise<GenericResponse<any>> {
    try {
      let validationErrors: any[] = [];

      const role = await this.roleModel.findOne({
        where: { id: id },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }
      const { name } = updateRoleInput;
      const employeeType =
        user?.userType === UserType.SuperAdmin
          ? null
          : updateRoleInput.employeeType;
      if (
        await this.roleModel.findOne({
          where: {
            name,
            orgID: role?.orgID,
            id: { [Op.ne]: id },
          },
        })
      ) {
        validationErrors = await Promise.all([
          {
            fieldName: 'name',
            error: true,
          },
        ]);
      }
      handleErrors(validationErrors, 'unique');
      const orgID = role?.orgID || null;

      const updatedRole = await this.roleModel.update(
        { ...updateRoleInput, orgID, employeeType },
        {
          where: { id },
        },
      );
      if (!updatedRole) {
        return {
          data: null,
          message: 'Role not updated, something went wrong!!',
        };
      }

      // Diffed against `role`, fetched pre-update — updatedRole itself is
      // just [affectedCount] here (no `returning: true`), not a usable
      // record.
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      const fieldsToCompare = {
        name,
        enabled: updateRoleInput.enabled,
        employeeType,
      };
      for (const [key, newValue] of Object.entries(fieldsToCompare)) {
        const oldValue = (role as any)[key];
        if (oldValue !== newValue) {
          changeJSON[key] = { OldValue: oldValue, newValue };
        }
      }
      const oldPermissions = Array.isArray(role.permissions)
        ? role.permissions.join(', ')
        : role.permissions;
      const newPermissions = Array.isArray(updateRoleInput.permissions)
        ? updateRoleInput.permissions.join(', ')
        : updateRoleInput.permissions;
      if (oldPermissions !== newPermissions) {
        changeJSON.permissions = {
          OldValue: oldPermissions,
          newValue: newPermissions,
        };
      }

      this.eventlogService.create({
        objectType: 'Role',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: { roleID: id, name: name ?? role.name },
        requestPayload: JSON.parse(JSON.stringify(updateRoleInput)),
        changeJSON,
        customDescription: `updated Role "${name ?? role.name}"`,
        user,
      });

      return {
        message: 'Role updated successfully',
        data: updatedRole,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getPermissions(id: string): Promise<any> {
    try {
      const permissions = await this.roleModel.findOne({
        where: {
          id,
        },
        attributes: ['permissions'],
      });
      if (!permissions) {
        throw new NotFoundException();
      }
      return permissions.permissions;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async deleteRole(id: string, user?: any): Promise<GenericResponse<any>> {
    try {
      const isRoleAssigned = await this.userService.findUserWithRole(id);
      if (isRoleAssigned) {
        throw new BadRequestException(
          'Deletion is not permitted as there are users currently associated with this role.',
        );
      } else {
        const role = await this.getRoleById(id, user);
        if (role) {
          await this.roleModel.destroy({
            where: {
              id,
            },
          });

          // getRoleById() returns GenericResponse<Role> ({ message, data
          // }), not the plain record — fields must come from role.data.
          this.eventlogService.create({
            objectType: 'Role',
            changeType: 'delete',
            objectID: id,
            authID: user.id,
            orgID: user?.orgID,
            updatedBy: user.name,
            payload: {
              roleID: id,
              name: role?.data?.name,
              employeeType: role?.data?.employeeType,
            },
            requestPayload: id,
            customDescription: `removed Role "${role?.data?.name}"`,
            user,
          });

          return {
            message: 'Role deleted successfully',
            data: null,
          };
        } else throw new NotFoundException(`Role with id ${id} not found`);
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async checkLogin(): Promise<boolean> {
    try {
      await this.roleModel.findAll();
      return true;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
