import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Organization } from '../models/organization.model';
import { CreateOrganizationInput } from '../dtos/create-organization-input.dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { QueryTypes } from 'sequelize';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { OrganizationFilterInput } from '../dtos/organization-filter-input.dto';
import { SortOrder, Status, UserType } from 'src/shared/enums';
import { UpdateOrganizationInput } from '../dtos/update-organization-input.dto';
import { EmployeeService } from 'src/employee/services/employee-service';
// import { PasswordService } from 'src/password-management/password/services/password.service';
import { PasswordHistoryService } from 'src/password-management/password-history/services/password-history.service';
import { generateHashedPassword } from 'src/shared/utils/password.utils';
// import { AuthService } from 'src/auth/services/auth.service';
import { Employee } from 'src/employee/models/employee.model';
import { Op } from 'sequelize';
import { Role } from 'src/role/models/role.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { ConfigService } from '@nestjs/config';
import { Session } from 'src/auth/models/session.model';
import { UploadService } from 'src/upload/services/upload.service';
import { Authentication } from 'src/auth/models/authentication.model';
import { SessionService } from 'src/auth/services/session.service';
import { randomUUID } from 'crypto';
@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization)
    private organizationModel: typeof Organization,
    @InjectModel(Role)
    private roleModel: typeof Role,
    @InjectModel(Session)
    private sessionModel: typeof Session,
    @InjectModel(Authentication)
    private authModel: typeof Authentication,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    private readonly sequelize: Sequelize,
    @Inject(forwardRef(() => EmployeeService))
    private employeeService: EmployeeService,
    // @Inject(forwardRef(() => PasswordService))
    // private passwordService: PasswordService,
    private passwordHistoryService: PasswordHistoryService,
    // @Inject(forwardRef(() => AuthService))
    // private authService: AuthService,
    @Inject(SessionService)
    private sessionService: SessionService,
    private eventlogService: EventLogService,
    private uploadService: UploadService,
    private config: ConfigService,
  ) {}

  //   async create(
  //     createOrganizationInput: CreateOrganizationInput,
  //     user: any,
  //     file: any,
  //   ): Promise<GenericResponse<Organization>> {
  //     try {
  //       const validationErrors = await uniqueFieldsCheck(
  //         this.organizationModel,
  //         ['name', 'email', 'phone', 'gstNo'],
  //         createOrganizationInput,
  //       );
  //       handleErrors(validationErrors, 'unique');

  //       let fileUrl: string | null = null;
  //       if (file) {
  //         const fileDetails = {
  //           Key: `${file?.originalname}`,
  //           Body: file?.buffer,
  //           Bucket: `${this.config.get('AWSBUCKETNAME')}/organization_logo`,
  //           ACL: 'public-read',
  //           ContentType: file?.mimetype,
  //         };
  //         fileUrl = await this.uploadService.uploadDocument(fileDetails);
  //       }
  //       const organization = await this.organizationModel.create({
  //         ...createOrganizationInput,
  //         logo: fileUrl,
  //         createdBy: user.id,
  //       });
  //       if (organization) {
  //         const role = await this.roleModel.findOne({
  //           where: {
  //             name: 'Organization Admin',
  //             orgID: null,
  //           },
  //         });
  //         const newRole = await this.roleModel.create({
  //           name: `${organization.name}_${role.name}`,
  //           orgID: organization.id,
  //           permissions: role.permissions,
  //           employeeType: UserType.Admin,
  //         });
  //         // handleErrors(validationErrors, 'unique');
  //         const employeeInput = {
  //           name: createOrganizationInput?.empName,
  //           employeeCode: createOrganizationInput?.empCode,
  //           email: createOrganizationInput?.empEmail,
  //           phone: createOrganizationInput?.empPhone,
  //           orgID: organization?.id, // Link to created organization
  //           role: UserType.Admin,
  //           joinedDate: createOrganizationInput?.empJoinedDate,
  //           exitDate: createOrganizationInput?.empExitDate,
  //           dob: null,
  //           roleID: newRole?.id,
  //           address: null,
  //           landmark: null,
  //           homePoint: null,
  //           employeeType: UserType.Admin,
  //         };
  //         const employee = await this.employeeService.create(
  //           employeeInput,
  //           createOrganizationInput?.empPassword,
  //           user,
  //         );
  //         if (employee) {
  //           const hashedPassword = await generateHashedPassword(
  //             createOrganizationInput?.empPassword,
  //           );

  //           await this.passwordHistoryService.addPasswordHistory(
  //             employee?.data?.id,
  //             hashedPassword,
  //           );
  //         }
  //         const eventPayload = JSON.parse(
  //           JSON.stringify(createOrganizationInput),
  //         );
  //         const eventLog = {
  //           objectType: 'Organization',
  //           changeType: 'add',
  //           objectID: organization.id,
  //           authID: user.id,
  //           updatedBy: user.name,
  //           payload: organization,
  //           requestPayload: eventPayload,
  //         };
  //         this.eventlogService.create(eventLog);
  //       }
  //       return {
  //         message: 'Organization created successfully',
  //         data: organization,
  //       };
  //     } catch (error) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //       throw new InternalServerErrorException(error);
  //     }
  //   }

  async create(
    createOrganizationInput: CreateOrganizationInput,
    user: any,
    file: any,
  ): Promise<GenericResponse<Organization>> {
    const transaction = await this.sequelize.transaction();
    try {
      if (createOrganizationInput?.domainName) {
        createOrganizationInput.domainName =
          createOrganizationInput.domainName.toLowerCase();
      }
      const validationErrors = await uniqueFieldsCheck(
        this.organizationModel,
        ['name', 'email', 'phone', 'gstNo', 'domainName'],
        createOrganizationInput,
      );
      handleErrors(validationErrors, 'unique');

      let fileUrl: string | null = null;
      if (file) {
        const publicBucket = this.config.get('AWSPUBLICBUCKETNAME');
        if (!publicBucket) {
          throw new InternalServerErrorException(
            'AWSPUBLICBUCKETNAME is not configured',
          );
        }
        const fileDetails = {
          Key: `${randomUUID()}_${file?.originalname}`,
          Body: file?.buffer,
          Bucket: `${publicBucket}/organization_logo`,
          ContentType: file?.mimetype,
        };
        fileUrl = await this.uploadService.uploadDocument(fileDetails);
      }

      const organization = await this.organizationModel.create(
        {
          ...createOrganizationInput,
          logo: fileUrl,
          createdBy: user.id,
        },
        { transaction },
      );
      const role = await this.roleModel.findOne({
        where: {
          name: 'Organization Admin',
          orgID: null,
        },
        transaction,
      });

      const newRole = await this.roleModel.create(
        {
          name: `${organization.name}_${role.name}`,
          orgID: organization.id,
          permissions: role.permissions,
          employeeType: UserType.Admin,
        },
        { transaction },
      );

      const employeeInput = {
        name: createOrganizationInput?.empName,
        employeeCode: createOrganizationInput?.empCode,
        email: createOrganizationInput?.empEmail,
        phone: createOrganizationInput?.empPhone,
        orgID: organization?.id,
        role: UserType.Admin,
        joinedDate: createOrganizationInput?.empJoinedDate,
        exitDate: createOrganizationInput?.empExitDate,
        dob: null,
        roleID: newRole?.id,
        address: null,
        landmark: null,
        homePoint: null,
        employeeType: UserType.Admin,
      };

      const employee = await this.employeeService.create(
        employeeInput,
        createOrganizationInput?.empPassword,
        user,
        transaction, // ensure your service supports receiving a transaction
      );

      if (employee) {
        const hashedPassword = await generateHashedPassword(
          createOrganizationInput?.empPassword,
        );

        await this.passwordHistoryService.addPasswordHistory(
          hashedPassword,
          employee?.data?.id,
          null, // authID is null for Employee password history
          transaction, // again, ensure this method supports transactions
        );
      }

      const eventPayload = JSON.parse(JSON.stringify(createOrganizationInput));
      const eventLog = {
        objectType: 'Organization',
        changeType: 'add',
        objectID: organization.id,
        authID: user.id,
        updatedBy: user.name,
        payload: organization,
        requestPayload: eventPayload,
        user,
      };

      await this.eventlogService.create(eventLog, transaction); // support transaction

      await transaction.commit();
      return {
        message: 'Organization created successfully',
        data: organization,
      };
    } catch (error) {
      await transaction.rollback();
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    organizationFilterInput: OrganizationFilterInput,
    user: any,
  ): Promise<PaginatedList<Organization>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = organizationFilterInput;

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

      if (user && user?.orgID != null) {
        whereClause.id = user.orgID;
      }
      const organizations = await this.organizationModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,
      });
      return {
        totalItems: organizations.count,
        items: organizations.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(
    id: string,
    transaction?: any,
  ): Promise<GenericResponse<Organization>> {
    try {
      const organization = await this.organizationModel.findOne({
        where: { id },
        transaction,
      });
      if (organization)
        return {
          message: 'Organization found',
          data: organization,
        };
      else throw new NotFoundException('Invalid Organization Id');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findName(
    orgId?: string,
    transaction?: any,
  ): Promise<GenericResponse<Organization>> {
    try {
      // No org id supplied -> nothing to look up
      if (!orgId || orgId === 'undefined') {
        return { message: 'No organization id provided', data: null };
      }

      const organization = await this.organizationModel.findOne({
        where: { id: orgId },
        attributes: ['id', 'name'], // only fetch what we need
        transaction,
      });

      if (!organization) {
        throw new NotFoundException('Invalid Organization Id');
      }

      return {
        message: 'Organization found',
        data: organization,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async organizationCount(): Promise<PaginatedList<number>> {
    try {
      const count = await this.organizationModel.count();
      return {
        totalItems: count,
        items: [count],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async update(
  //   id: string,
  //   updateOrganizationInput: UpdateOrganizationInput,
  //   user: any,
  //   file: any,
  // ): Promise<any> {
  //   try {
  //     const transaction = await this.sequelize.transaction();
  //     const organization = await this.findOne(id);
  //     const validationErrors = await uniqueFieldsCheck(
  //       this.organizationModel,
  //       ['name', 'email', 'phone', 'gstNo', 'domainName'],
  //       updateOrganizationInput,
  //       id,
  //     );
  //     handleErrors(validationErrors, 'unique');
  //     if (updateOrganizationInput?.domainName) {
  //       updateOrganizationInput.domainName =
  //         updateOrganizationInput.domainName.toLowerCase();
  //     }
  //     const updateData = {
  //       ...updateOrganizationInput, // Spread the existing update fields
  //     };
  //     let fileUrl: string | null = null;
  //     if (file) {
  //       const fileDetails = {
  //         Key: `${file?.originalname}`,
  //         Body: file?.buffer,
  //         Bucket: `${this.config.get('AWSBUCKETNAME')}/organization_logo`,
  //         ACL: 'public-read',
  //         ContentType: file?.mimetype,
  //       };
  //       fileUrl = await this.uploadService.uploadDocument(fileDetails);
  //       updateData.logo = fileUrl;
  //     }

  //     const updatedOrganization = await this.organizationModel.update(
  //       updateData,
  //       {
  //         where: { id },
  //         returning: true,
  //       },
  //     );
  //     const employee = await this.employeeModel.findOne({
  //       where: { orgID: id, employeeType: UserType.Admin },
  //       attributes: ['id'],
  //     });
  //     if (updateOrganizationInput.status === Status.Active) {
  //       if (employee) {
  //         await this.authModel.update(
  //           {
  //             failedLoginAttempts: 0,
  //             status: Status.Active,
  //           },
  //           {
  //             where: {
  //               employeeID: employee.id,
  //               userType: UserType.Employee,
  //             },
  //           },
  //         );
  //       }
  //     }
  //           console.log("employee:::",employee.id);

  //     const employeeInput = {
  //       name: updateOrganizationInput?.empName,
  //       email: updateOrganizationInput?.empEmail,
  //       phone: updateOrganizationInput?.empPhone,
  //     }
  //     console.log("employeeInput:::",employeeInput);
  //     // Update the current admin's own details — name, email, phone on Employee only.
  //     if (employee) {
  //       if (employeeInput.email || employeeInput.phone) {
  //         const employeeValidationErrors = await uniqueFieldsCheck(
  //           this.employeeModel,
  //           ['email', 'phone'],
  //           employeeInput,
  //           String(employee.id),
  //         );
  //         handleErrors(employeeValidationErrors, 'unique');
  //       }

  //       const empUpdate = await this.employeeModel.update(employeeInput, {
  //         where: { id: employee.id },
  //         transaction,
  //       });
  //       console.log("empUpdate::",empUpdate)
  //     }
  //     if (updateOrganizationInput?.empPassword) {
  //       console.log("mpPassword::",updateOrganizationInput?.empPassword)
  //       const hashedPassword = await generateHashedPassword(updateOrganizationInput?.empPassword);
  //       await this.authModel.update(
  //         { hashedPassword, passwordCreatedAt: new Date() },
  //         { where: { employeeID: employee.id, userType: UserType.Employee }, transaction },
  //       );
  //               // console.log("hashedPassword::",hashedPassword)

  //       await this.passwordHistoryService.addPasswordHistory(
  //         hashedPassword,
  //         employee.id,
  //         null,
  //         transaction,
  //       );
  //                       console.log("hashedPassword::",hashedPassword)

  //     }
  //     const eventPayload = JSON.parse(JSON.stringify(updateOrganizationInput));
  //     const eventLog = {
  //       objectType: 'Organization',
  //       changeType: 'edit',
  //       objectID: id,
  //       authID: user.id,
  //       updatedBy: user.name,
  //       payload: organization.data,
  //       requestPayload: eventPayload,
  //     };
  //     await this.eventlogService.create(eventLog);

  //     return {
  //       message: 'Organization  updated successfully',
  //       data: updatedOrganization?.[1]?.[0],
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  async update(
    id: string,
    updateOrganizationInput: UpdateOrganizationInput,
    user: any,
    file: any,
  ): Promise<any> {
    const transaction = await this.sequelize.transaction();
    try {
      const organization = await this.findOne(id);
      const validationErrors = await uniqueFieldsCheck(
        this.organizationModel,
        ['name', 'email', 'phone', 'gstNo', 'domainName'],
        updateOrganizationInput,
        id,
      );
      handleErrors(validationErrors, 'unique');
      if (updateOrganizationInput?.domainName) {
        updateOrganizationInput.domainName =
          updateOrganizationInput.domainName.toLowerCase();
      }
      const updateData = { ...updateOrganizationInput };
      // logo is only written from an uploaded file below. Blocks a stale
      // client echoing an old logo URL back into the row.
      delete updateData.logo;

      let fileUrl: string | null = null;
      if (file) {
        const publicBucket = this.config.get('AWSPUBLICBUCKETNAME');
        if (!publicBucket) {
          throw new InternalServerErrorException(
            'AWSPUBLICBUCKETNAME is not configured',
          );
        }
        const fileDetails = {
          Key: `${randomUUID()}_${file?.originalname}`,
          Body: file?.buffer,
          Bucket: `${publicBucket}/organization_logo`,
          ContentType: file?.mimetype,
        };
        fileUrl = await this.uploadService.uploadDocument(fileDetails);
        updateData.logo = fileUrl;
      }

      const updatedOrganization = await this.organizationModel.update(
        updateData,
        {
          where: { id },
          returning: true,
          transaction,
        },
      );

      const employee = await this.employeeModel.findOne({
        where: { orgID: id, employeeType: UserType.Admin },
        attributes: ['id'],
        transaction,
      });
      // to logout the current active sessions of admin
      let authRecord: { id: bigint } | null = null;
      if (employee) {
        authRecord = await this.authModel.findOne({
          where: { employeeID: employee.id, userType: UserType.Employee },
          attributes: ['id'],
          transaction,
        });
      }
      if (updateOrganizationInput.status === Status.Active) {
        if (employee) {
          await this.authModel.update(
            {
              failedLoginAttempts: 0,
              status: Status.Active,
            },
            {
              where: {
                employeeID: employee.id,
                userType: UserType.Employee,
              },
              transaction,
            },
          );
        }
      }
      const employeeInput = {
        name: updateOrganizationInput?.empName,
        email: updateOrganizationInput?.empEmail,
        phone: updateOrganizationInput?.empPhone,
      };

      if (employee) {
        const hasProfileChange =
          employeeInput.name || employeeInput.email || employeeInput.phone;

        if (employeeInput.email || employeeInput.phone) {
          const employeeValidationErrors = await uniqueFieldsCheck(
            this.employeeModel,
            ['email', 'phone'],
            employeeInput,
            String(employee.id),
          );
          handleErrors(employeeValidationErrors, 'unique');
        }

        // 1. Employee table — always sync whatever was submitted
        if (hasProfileChange) {
          await this.employeeModel.update(employeeInput, {
            where: { id: employee.id },
            transaction,
          });
        }
        const authUpdateData: any = {};
        if (employeeInput.name) authUpdateData.name = employeeInput.name;
        if (employeeInput.email) authUpdateData.email = employeeInput.email;
        if (employeeInput.phone) authUpdateData.phone = employeeInput.phone;

        let hashedPassword: string | null = null;
        if (updateOrganizationInput?.empPassword) {
          hashedPassword = await generateHashedPassword(
            updateOrganizationInput.empPassword,
          );
          authUpdateData.hashedPassword = hashedPassword;
          authUpdateData.passwordCreatedAt = new Date();
        }

        if (Object.keys(authUpdateData).length > 0) {
          await this.authModel.update(authUpdateData, {
            where: { employeeID: employee.id, userType: UserType.Employee },
            transaction,
          });
          // Email, phone, name, or password changed — force re-login everywhere.
          if (authRecord) {
            await this.sessionService.invalidate(String(authRecord.id));
          }
        }

        // 3. Password history — only when password actually changed
        if (hashedPassword) {
          await this.passwordHistoryService.addPasswordHistory(
            hashedPassword,
            employee.id,
            null,
            transaction,
          );
        }
      }

      const eventPayload = JSON.parse(JSON.stringify(updateOrganizationInput));
      const eventLog = {
        objectType: 'Organization',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        payload: organization.data,
        requestPayload: eventPayload,
        user,
      };
      await this.eventlogService.create(eventLog);

      await transaction.commit();

      return {
        message: 'Organization updated successfully',
        data: updatedOrganization?.[1]?.[0],
      };
    } catch (error) {
      await transaction.rollback();
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async softDelete(id: string): Promise<GenericResponse<null>> {
    try {
      await this.findOne(id);
      const existingEmployee = await Employee.findOne({
        where: {
          orgID: { [Op.eq]: id },
        },
      });
      if (existingEmployee) {
        throw new NotFoundException(
          'This Organization cannot be deleted as it is currently linked to existing Employee records.',
        );
      } else {
        await this.organizationModel.destroy({
          where: {
            id,
          },
        });
      }
      return {
        message: 'Organization  deleted successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async superAdminLoginThroughOrg(
    id: any,
    user: any,
    token: any,
  ): Promise<GenericResponse<Organization>> {
    const organization = await this.organizationModel.findOne({
      where: { id },
    });
    const role = await this.roleModel.findOne({
      where: {
        name: {
          [Op.or]: [
            `${organization.name}_Organization Admin`,
            'Organization Admin',
          ],
        },
        orgID: id,
      },
    });
    const updateSessionInput = {
      orgID: id,
      permissions: role?.permissions,
      userType: UserType.Employee,
    };
    await this.sessionModel.update(updateSessionInput, {
      where: {
        token: token, // Match userType exactly
        invalidated: false,
      },
    });
    return {
      status: true,
      message: '',
    };
  }

  async superAdminLogoutFromOrg(
    user: any,
    token: any,
  ): Promise<GenericResponse<Organization>> {
    const updateSessionInput = {
      orgID: null,
      permissions: null,
      userType: UserType.SuperAdmin,
    };
    await this.sessionModel.update(updateSessionInput, {
      where: {
        token: token, // Match userType exactly
        invalidated: false,
      },
    });
    return {
      status: true,
      message: '',
    };
  }

  // async orgList(vendorID: any): Promise<PaginatedList<Organization>> {
  //   try {
  //     // If no vendorID provided, return all orgs without the VendorOrganizations filter
  //     if (!vendorID) {
  //       const organizations = await this.organizationModel.findAndCountAll({
  //         attributes: ['name', 'id', 'email', 'address', 'gstNo', 'status'],
  //       });
  //       return {
  //         totalItems: organizations.count,
  //         items: organizations.rows,
  //       };
  //     }
  //     const organizations = await this.organizationModel.findAndCountAll({
  //       attributes: ['name', 'id', 'email', 'address', 'gstNo', 'status'],
  //       distinct: true,
  //       where: {
  //         id: {
  //           [Op.notIn]: Sequelize.literal(`
  //                 (SELECT vo."orgID"
  //                  FROM "VendorOrganizations" vo
  //                  WHERE vo."vendorID" = ${vendorID}
  //                  AND vo."requestStatus" != 'Cancelled')
  //               `),
  //         },
  //       },
  //     });

  //     return {
  //       totalItems: organizations.count,
  //       items: organizations.rows,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  async orgList(vendorID: string): Promise<PaginatedList<Organization>> {
    try {
      if (!vendorID) {
        const organizations = await this.organizationModel.findAndCountAll({
          attributes: ['name', 'id', 'email', 'address', 'gstNo', 'status'],
        });
        return {
          totalItems: organizations.count,
          items: organizations.rows,
        };
      }

      const excludedOrgs = await this.organizationModel.sequelize.query<{
        orgID: number;
      }>(
        `
        SELECT vo."orgID"
        FROM "VendorOrganizations" vo
        WHERE vo."vendorID" = :vendorID
        AND vo."requestStatus" != 'Cancelled'
      `,
        {
          replacements: { vendorID },
          type: QueryTypes.SELECT,
        },
      );

      const excludedOrgIds = excludedOrgs.map((row) => row.orgID);

      const organizations = await this.organizationModel.findAndCountAll({
        attributes: ['name', 'id', 'email', 'address', 'gstNo', 'status'],
        distinct: true,
        where:
          excludedOrgIds.length > 0
            ? { id: { [Op.notIn]: excludedOrgIds } }
            : {},
      });

      return {
        totalItems: organizations.count,
        items: organizations.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async organizationSwitching(
    id: string,
    user: any,
    token: any,
  ): Promise<GenericResponse<null>> {
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
}
