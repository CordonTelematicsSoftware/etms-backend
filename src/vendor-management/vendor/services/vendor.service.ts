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
import { Vendor } from '../models/vendor.model';
import { CreateVendorInput } from '../dtos/create-vendor-input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { QueryTypes } from 'sequelize';
import {
  formatExceptions,
  handleErrors,
} from 'src/shared/utils/format-exception';
import { VendorFilterInput } from '../dtos/vendor-filter-input.dto';
import { SortOrder, Status, UserType } from 'src/shared/enums';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { UpdateVendorInput } from '../dtos/update-vendor-input.dto';
import { VendorRole } from 'src/vendor-management/vendor-role/models/vendor-role.model';
import { VendorUserService } from 'src/vendor-management/vendor-user/services/vendor-user.service';
import { VendorUser } from 'src/vendor-management/vendor-user/models/vendor-user.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { UploadService } from 'src/upload/services/upload.service';
import { ConfigService } from '@nestjs/config';
import { Authentication } from 'src/auth/models/authentication.model';
import { generateHashedPassword } from 'src/shared/utils/password.utils';
import { SessionService } from 'src/auth/services/session.service';
import { randomUUID } from 'crypto';

@Injectable()
export class VendorService {
  constructor(
    @InjectModel(Vendor)
    private vendorModel: typeof Vendor,
    @InjectModel(VendorRole)
    private vendorRoleModel: typeof VendorRole,
    @InjectModel(Authentication)
    private authModel: typeof Authentication,
    @InjectModel(VendorUser)
    private vendorUserModel: typeof VendorUser,
    @Inject(forwardRef(() => VendorUserService))
    private vendorUserService: VendorUserService,
    @Inject(SessionService)
    private sessionService: SessionService,
    private eventlogService: EventLogService,
    private uploadService: UploadService,
    private config: ConfigService,
    private readonly sequelize: Sequelize,
  ) {}
  async create(
    createVendorInput: CreateVendorInput,
    user: any,
    file: any,
  ): Promise<GenericResponse<Vendor>> {
    const transaction = await this.sequelize.transaction();
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.vendorModel,
        ['name', 'email', 'phone', 'gstNo', 'code'],
        createVendorInput,
      );
      const formatted = formatExceptions(validationErrors, 'unique');
      if (Object.keys(formatted).length) {
        throw new BadRequestException(formatted);
      }
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
          Key: `${randomUUID()}_${file.originalname}`,
          Body: file.buffer,
          Bucket: `${publicBucket}/vendor_logo`,
          ContentType: file.mimetype,
        };
        fileUrl = await this.uploadService.uploadDocument(fileDetails);
      }
      const vendor = await this.vendorModel.create(
        {
          ...createVendorInput,
          logo: fileUrl,
          createdBy: user.id,
        },
        { transaction },
      );

      if (vendor) {
        const vendorRole = await this.vendorRoleModel.findOne({
          where: {
            name: 'Vendor Admin',
            vendorID: null,
          },
          transaction,
        });
        const newRole = await this.vendorRoleModel.create(
          {
            // name: vendorRole.name,
            name: `${vendor.name}_${vendorRole.name}`,
            vendorID: vendor.id,
            permissions: vendorRole.permissions,
          },
          { transaction },
        );

        if (newRole) {
          // const hashedPassword = await generateHashedPassword(
          //   createVendorInput?.vendorUserPassword,
          // );
          handleErrors(validationErrors, 'unique');
          const vendorUserbyVendorInput = {
            name: createVendorInput?.vendorUserName,
            email: createVendorInput?.vendorUserEmail,
            phone: createVendorInput?.vendorUserPhone,
            password: createVendorInput?.vendorUserPassword,
            vendorID: vendor?.id, // Link to created organization
            vendorRoleID: newRole?.id,
          };
          await this.vendorUserService.create(
            vendorUserbyVendorInput,
            user,
            transaction,
          );
        }
        const eventPayload = JSON.parse(JSON.stringify(createVendorInput));
        const eventLog = {
          objectType: 'Vendor',
          changeType: 'add',
          objectID: vendor.id,
          authID: user.id,
          updatedBy: user.name,
          payload: vendor,
          requestPayload: eventPayload,
          user,
        };

        await this.eventlogService.create(eventLog, transaction);
        await transaction.commit();
      }
      return {
        message: 'Vendor created successfully',
        data: vendor,
      };
    } catch (error) {
      await transaction.rollback();
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    vendorFilterInput: VendorFilterInput,
  ): Promise<PaginatedList<Vendor>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = vendorFilterInput;

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

      const vendor = await this.vendorModel.findAndCountAll({
        attributes: ['name', 'id', 'email', 'address', 'gstNo', 'status'],
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      return {
        totalItems: vendor.count,
        items: vendor.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<Vendor>> {
    try {
      const vendor = await this.vendorModel.findOne({
        where: { id },
      });
      if (vendor)
        return {
          message: 'Vendor found',
          data: vendor,
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
  //   updateVendorInput: UpdateVendorInput,
  //   user: any,
  //   file: any,
  // ): Promise<any> {
  //   try {
  //     const vendorById = await this.findOne(id);
  //     const { name } = updateVendorInput;
  //     await this.vendorModel.findOne({
  //       where: {
  //         name: name,
  //         id: { [Op.ne]: id },
  //       },
  //     });
  //     const updateData = {
  //       ...updateVendorInput, // Spread the existing update fields
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
  //     const validationErrors = await uniqueFieldsCheck(
  //       this.vendorModel,
  //       ['name', 'email', 'phone', 'gstNo', 'code'],
  //       updateVendorInput,
  //       id,
  //       null,
  //     );
  //     handleErrors(validationErrors, 'unique');
  //     const vendor = await this.vendorModel.update(updateData, {
  //       where: { id },
  //       returning: true,
  //     });
  //     if (updateVendorInput.status === Status.Active) {
  //       await this.authModel.update(
  //         {
  //           failedLoginAttempts: 0,
  //           status: Status.Active,
  //         },
  //         {
  //           where: {
  //             vendorID: id,
  //             userType: UserType.Vendor,
  //           },
  //         },
  //       );
  //     }
  //     const eventPayload = JSON.parse(JSON.stringify(updateVendorInput));
  //     const eventLog = {
  //       objectType: 'Vendor',
  //       changeType: 'edit',
  //       objectID: id,
  //       authID: user?.id,
  //       updatedBy: user?.name,
  //       payload: vendorById.data,
  //       requestPayload: eventPayload,
  //     };
  //     await this.eventlogService.create(eventLog);
  //     return {
  //       message: 'Vendor updated successfully',
  //       data: vendor?.[1]?.[0],
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
    updateVendorInput: UpdateVendorInput,
    user: any,
    file: any,
  ): Promise<any> {
    const transaction = await this.sequelize.transaction();
    try {
      const vendorById = await this.findOne(id);
      const { name } = updateVendorInput;

      await this.vendorModel.findOne({
        where: {
          name: name,
          id: { [Op.ne]: id },
        },
        transaction,
      });

      const updateData = { ...updateVendorInput };
      // logo is only ever written from an uploaded file below. Reads are now
      // presigned, so a client that echoes the GET's logo back as a body field
      // would otherwise persist an expiring URL. Symmetric with the guard in
      // driver.service.ts update.
      delete updateData.logo;

      const validationErrors = await uniqueFieldsCheck(
        this.vendorModel,
        ['name', 'email', 'phone', 'gstNo', 'code'],
        updateVendorInput,
        id,
        null,
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
          Bucket: `${publicBucket}/vendor_logo`,
          ContentType: file?.mimetype,
        };
        fileUrl = await this.uploadService.uploadDocument(fileDetails);
        updateData.logo = fileUrl;
      }

      const vendor = await this.vendorModel.update(updateData, {
        where: { id },
        returning: true,
        transaction,
      });

      if (updateVendorInput.status === Status.Active) {
        await this.authModel.update(
          {
            failedLoginAttempts: 0,
            status: Status.Active,
          },
          {
            where: {
              vendorID: id,
              userType: UserType.Vendor,
            },
            transaction,
          },
        );
      }

      // --- Vendor Admin (VendorUser) sync — mirrors org/Employee pattern ---
      // The vendor admin's VendorRole is identified by name, not a stored
      // "is admin" flag (see create(): `${vendor.name}_Vendor Admin`).
      const vendorAdminRole = await this.vendorRoleModel.findOne({
        where: { vendorID: id, name: `${vendorById?.data?.name}_Vendor Admin` },
        transaction,
      });

      if (vendorAdminRole) {
        const vendorUser = await this.vendorUserModel.findOne({
          where: { vendorID: id, vendorRoleID: vendorAdminRole.id },
          transaction,
        });

        if (vendorUser) {
          const vendorUserInput: any = {};
          if (updateVendorInput?.vendorUserName)
            vendorUserInput.name = updateVendorInput.vendorUserName;
          if (updateVendorInput?.vendorUserEmail)
            vendorUserInput.email = updateVendorInput.vendorUserEmail;
          if (updateVendorInput?.vendorUserPhone)
            vendorUserInput.phone = updateVendorInput.vendorUserPhone;

          if (vendorUserInput.email || vendorUserInput.phone) {
            const vendorUserValidationErrors = await uniqueFieldsCheck(
              this.vendorUserModel,
              ['email', 'phone'],
              vendorUserInput,
              String(vendorUser.id),
            );
            handleErrors(vendorUserValidationErrors, 'unique');
          }

          if (Object.keys(vendorUserInput).length > 0) {
            await this.vendorUserModel.update(vendorUserInput, {
              where: { id: vendorUser.id },
              transaction,
            });
            // To logout all the current  active sessions of vendor
            const vendorUserAuthRecord = await this.authModel.findOne({
              where: { vendorUserID: vendorUser.id, userType: UserType.Vendor },
              attributes: ['id'],
              transaction,
            });
            if (vendorUserAuthRecord) {
              await this.sessionService.invalidate(
                String(vendorUserAuthRecord.id),
              );
            }
          }

          // Keep Auth in sync — vendor login credentials live here, not on VendorUser
          const authUpdateData: any = { ...vendorUserInput };

          let hashedPassword: string | null = null;
          if (updateVendorInput?.vendorUserPassword) {
            hashedPassword = await generateHashedPassword(
              updateVendorInput.vendorUserPassword,
            );
            authUpdateData.hashedPassword = hashedPassword;
            authUpdateData.passwordCreatedAt = new Date();
          }

          if (Object.keys(authUpdateData).length > 0) {
            await this.authModel.update(authUpdateData, {
              where: { vendorUserID: vendorUser.id, userType: UserType.Vendor },
              transaction,
            });
          }
        }
        // await this.sessionService.invalidate(id);
      }

      const eventPayload = JSON.parse(JSON.stringify(updateVendorInput));
      const eventLog = {
        objectType: 'Vendor',
        changeType: 'edit',
        objectID: id,
        authID: user?.id,
        updatedBy: user?.name,
        payload: vendorById.data,
        requestPayload: eventPayload,
        user,
      };
      await this.eventlogService.create(eventLog, transaction);

      await transaction.commit();

      return {
        message: 'Vendor updated successfully',
        data: vendor?.[1]?.[0],
      };
    } catch (error) {
      await transaction.rollback();
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async delete(id: string, user: any): Promise<GenericResponse<null>> {
    try {
      await this.findOne(id);
      const existingVendorUser = await VendorUser.findOne({
        where: {
          vendorID: { [Op.eq]: id },
        },
      });
      if (existingVendorUser) {
        throw new NotFoundException(
          'This Vendor cannot be deleted as it is currently linked to existing User records.',
        );
      } else {
        const eventLog = {
          objectType: 'Vendor',
          changeType: 'delete',
          objectID: id,
          authID: user.id,
          orgID: user.orgID,
          updatedBy: user.name,
          payload: '',
          requestPayload: id,
          user,
        };
        this.eventlogService.create(eventLog);
        await this.vendorModel.destroy({
          where: {
            id,
          },
        });
        return {
          message: 'Vendor deleted successfully',
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

  // async vendorsList(orgID: any): Promise<PaginatedList<Vendor>> {
  //   try {
  //     const vendor = await this.vendorModel.findAndCountAll({
  //       attributes: ['name', 'id', 'email', 'address', 'gstNo', 'status'],
  //       distinct: true,
  //       where: {
  //         id: {
  //           [Op.notIn]: Sequelize.literal(`
  //               (SELECT vo."vendorID"
  //                FROM "VendorOrganizations" vo
  //                WHERE vo."orgID" = ${orgID}
  //                AND vo."requestStatus" != 'Cancelled')
  //             `),
  //         },
  //       },
  //     });

  //     return {
  //       totalItems: vendor.count,
  //       items: vendor.rows,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  async vendorsList(orgID: string): Promise<PaginatedList<Vendor>> {
    try {
      const excludedVendors = await this.vendorModel.sequelize.query<{
        vendorID: number;
      }>(
        `
        SELECT vo."vendorID"
        FROM "VendorOrganizations" vo
        WHERE vo."orgID" = :orgID
        AND vo."requestStatus" != 'Cancelled'
      `,
        {
          replacements: { orgID },
          type: QueryTypes.SELECT,
        },
      );

      const excludedVendorIds = excludedVendors.map((row) => row.vendorID);

      const vendor = await this.vendorModel.findAndCountAll({
        attributes: ['name', 'id', 'email', 'address', 'gstNo', 'status'],
        distinct: true,
        where:
          excludedVendorIds.length > 0
            ? { id: { [Op.notIn]: excludedVendorIds } }
            : {}, // no exclusions if none found — matches original NOT IN (empty) semantics
      });

      return {
        totalItems: vendor.count,
        items: vendor.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async vendorsCount(): Promise<any> {
    try {
      const vendor = await this.vendorModel.count({});
      return {
        message: 'Total Vendors Count',
        totalItems: vendor,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
