import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Brand } from '../models/brand.model';
import { CreateBrandInput } from '../dtos/create-brand-input-dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { BrandFilterInput } from '../dtos/brand-filter-input.-dto';
import { SortOrder } from 'src/shared/enums';
import { Op } from 'sequelize';
import { UpdateBrandInput } from '../dtos/update-brand-input-dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { CabService } from 'src/cabs/services/cab.service';

@Injectable()
export class BrandService {
  constructor(
    @InjectModel(Brand) private brandModel: typeof Brand,
    private eventlogService: EventLogService,
    private cabService: CabService,
  ) {}

  async create(
    createBrandInput: CreateBrandInput,
    user: any,
  ): Promise<GenericResponse<Brand>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.brandModel,
        ['name'],
        createBrandInput,
      );
      handleErrors(validationErrors, 'unique');
      const brand = await this.brandModel.create({
        ...createBrandInput,
      });
      const eventPayload = JSON.parse(JSON.stringify(createBrandInput));
      const eventLog = {
        objectType: 'Brand',
        changeType: 'add',
        objectID: brand.id,
        authID: user.id,
        updatedBy: user.name,
        payload: brand,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Brand created successfully',
        data: brand,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    brandFilterInput: BrandFilterInput,
  ): Promise<PaginatedList<Brand>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = brandFilterInput;

      let whereClause: any = {};

      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            {
              brandName: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }

      const brand = await this.brandModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      return {
        totalItems: brand.count,
        items: brand.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async findAllActiveBrands(
    brandFilterInput: BrandFilterInput,
  ): Promise<PaginatedList<Brand>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = brandFilterInput;

      let whereClause: any = {
        status: 'Active',
      };

      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            {
              brandName: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }

      const brand = await this.brandModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      return {
        totalItems: brand.count,
        items: brand.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<Brand>> {
    try {
      const brand = await this.brandModel.findOne({
        where: { id },
      });
      if (brand)
        return {
          message: 'Brand found',
          data: brand,
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
    updateBrandInput: UpdateBrandInput,
    user: any,
  ): Promise<any> {
    try {
      const { name } = updateBrandInput;
      const existingBrand = await this.brandModel.findOne({
        where: {
          name: name,
          id: { [Op.ne]: id },
        },
      });
      if (existingBrand) {
        throw new NotFoundException('A brand with this name already exists.');
      }
      const cabExists = await this.cabService.findCabWithBrandID(id);
      if (cabExists) {
        throw new BadRequestException(
          'Updation is not permitted as there are cabs currently associated with this brand.',
        );
      }
      const brandById = await this.findOne(id);
      const eventPayload = JSON.parse(JSON.stringify(updateBrandInput));
      const eventLog = {
        objectType: 'Brand',
        changeType: 'edit',
        objectID: id,
        authID: user?.id,
        updatedBy: user?.name,
        payload: brandById?.data,
        requestPayload: eventPayload,
        user,
      };
      await this.eventlogService.create(eventLog);
      const brand = await this.brandModel.update(updateBrandInput, {
        where: { id },
        returning: true,
      });
      return {
        message: 'Brand updated successfully',
        data: brand?.[1]?.[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async delete(id: string, user: any): Promise<GenericResponse<null>> {
    try {
      const cabExists = await this.cabService.findCabWithBrandID(id);
      if (cabExists) {
        throw new BadRequestException(
          'Deletion is not permitted as there are cabs currently associated with this brand.',
        );
      } else {
        const eventLog = {
          objectType: 'Brand',
          changeType: 'delete',
          objectID: id,
          authID: user.id,
          updatedBy: user.name,
          payload: '',
          requestPayload: id,
          user,
        };
        this.eventlogService.create(eventLog);
        await this.brandModel.destroy({
          where: {
            id,
          },
        });
        return {
          message: 'Brand deleted successfully',
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
}
