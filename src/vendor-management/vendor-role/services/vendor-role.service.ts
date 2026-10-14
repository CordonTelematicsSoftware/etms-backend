import {
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
import { SortOrder } from 'src/shared/enums';
import { Op, Sequelize } from 'sequelize';
import { VendorRole } from '../models/vendor-role.model';
import { CreateVendorRoleInput } from '../dtos/create-vendor-role-input.dto';
import { VendorRoleFilterInput } from '../dtos/vendor-role-filter-input.dto';
import { UpdateVendorRoleInput } from '../dtos/update-vendor-role-input.dto';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { EventLogService } from 'src/eventlog/eventlog.service';

@Injectable()
export class VendorRoleService {
  constructor(
    @InjectModel(VendorRole)
    private vendorRoleModel: typeof VendorRole,
    @InjectModel(Vendor)
    private vendorModel: typeof Vendor,
    private eventlogService: EventLogService,
  ) {}
  async create(
    createVendorRoleInput: CreateVendorRoleInput,
    user?: any,
  ): Promise<GenericResponse<VendorRole>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.vendorRoleModel,
        ['name', 'vendorID'],
        createVendorRoleInput,
      );

      handleErrors(validationErrors, 'unique');
      const vendorRole = await this.vendorRoleModel.create({
        ...createVendorRoleInput,
        vendorID: user?.vendorID,
      });
      const eventPayload = JSON.parse(JSON.stringify(createVendorRoleInput));
      const eventLog = {
        objectType: 'VendorRole',
        changeType: 'add',
        objectID: vendorRole.id,
        authID: user.id,
        updatedBy: user.name,
        payload: vendorRole,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Vendor role created successfully',
        data: vendorRole,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    vendorRoleFilterInput: VendorRoleFilterInput,
    user: any,
  ): Promise<PaginatedList<VendorRole>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = vendorRoleFilterInput;

      let whereClause: any = {};
      if (user?.vendorID) {
        whereClause.vendorID = user?.vendorID;
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

      const vendorRole = await this.vendorRoleModel.findAndCountAll({
        attributes: ['name', 'id'],
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
        include: [
          {
            model: Vendor,
            attributes: [
              'id',
              [Sequelize.literal('"vendor"."name"'), 'vendor'],
            ],
            as: 'vendor',
            required: false,
          },
        ],
      });
      return {
        totalItems: vendorRole.count,
        items: vendorRole.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<VendorRole>> {
    try {
      const vendorRole = await this.vendorRoleModel.findOne({
        where: { id },
      });
      if (vendorRole)
        return {
          message: 'Vendor Role found',
          data: vendorRole,
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
    updateVendorRoleInput: UpdateVendorRoleInput,
    user: any,
  ): Promise<any> {
    try {
      let { name } = updateVendorRoleInput;
      const { vendorID } = updateVendorRoleInput;
      const vendor = await this.vendorModel.findOne({
        where: { id: vendorID },
        attributes: ['name'],
      });
      if (name === 'Vendor Admin' && vendor?.name) {
        name = `${vendor.name}_Vendor Admin`;
        updateVendorRoleInput.name = name;
      }
      const existingVendorRole = await this.vendorRoleModel.findOne({
        where: {
          name: name,
          id: { [Op.ne]: id },
          vendorID: user.vendorID,
        },
      });
      if (existingVendorRole) {
        throw new NotFoundException(
          'A vendor role with this name already exists.',
        );
      }
      const vendorRole = await this.vendorRoleModel.update(
        updateVendorRoleInput,
        {
          where: { id },
          returning: true,
        },
      );
      const eventPayload = JSON.parse(JSON.stringify(updateVendorRoleInput));
      const eventLog = {
        objectType: 'VendorRole',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        payload: existingVendorRole,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Vendor role updated successfully',
        data: vendorRole?.[1]?.[0],
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
      await this.vendorRoleModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'Vendor role deleted successfully',
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
