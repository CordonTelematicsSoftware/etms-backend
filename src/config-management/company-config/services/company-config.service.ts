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
import { Op } from 'sequelize';
import { SortOrder } from 'src/shared/enums';
import { CompanyConfiguration } from '../models/company-config.model';
import { CreateCompanyConfigInput } from '../dtos/create-company-config-input.dto';
import { CompanyConfigFilterInput } from '../dtos/company-config-filter-input.dts';
import { UpdateCompanyConfigInput } from '../dtos/update-company-config-input.dto';

@Injectable()
export class CompanyConfigService {
  constructor(
    @InjectModel(CompanyConfiguration)
    private companyConfigModel: typeof CompanyConfiguration,
  ) {}

  async create(
    createCompanyConfigInput: CreateCompanyConfigInput,
    currentUser: any,
  ): Promise<GenericResponse<CompanyConfiguration>> {
    try {
      const { configID } = createCompanyConfigInput;

      const existingConfig = await this.companyConfigModel.findOne({
        where: {
          configID,
          orgID: currentUser?.orgID,
        },
      });

      if (existingConfig) {
        throw new NotFoundException(
          'A company with this configuration already exists.',
        );
      }
      const config = await this.companyConfigModel.create({
        ...createCompanyConfigInput,
        createdBy: currentUser?.employeeID,
      });
      return {
        message: 'Company Configuration created successfully',
        data: config,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    companyConfigFilterInput: CompanyConfigFilterInput,
  ): Promise<PaginatedList<CompanyConfiguration>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = companyConfigFilterInput;

      const whereClause: any = { enabled: true };
      if (search) {
        whereClause.name = {
          [Op.iLike]: `%${search}%`,
        };
      }

      const config = await this.companyConfigModel.findAndCountAll({
        attributes: ['configID', 'id', 'configValue', 'orgID'],
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      return {
        totalItems: config.count,
        items: config.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<CompanyConfiguration>> {
    try {
      const config = await this.companyConfigModel.findOne({
        where: { id },
        attributes: ['id', 'configID', 'configValue', 'orgID'],
      });
      if (config) {
        return {
          message: 'Company config found',
          data: config,
        };
      } else {
        throw new NotFoundException();
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateCompanyConfigInput: UpdateCompanyConfigInput,
    user: any,
  ): Promise<any> {
    try {
      const { configID } = updateCompanyConfigInput;
      const existingConfig = await this.companyConfigModel.findOne({
        where: {
          configID,
          id: { [Op.ne]: id },
        },
      });

      if (existingConfig) {
        throw new NotFoundException(
          'A compnay config with this config already exists.',
        );
      } else {
        const config = await this.companyConfigModel.update(
          {
            ...updateCompanyConfigInput,
          },
          {
            where: { id: id, orgID: user?.orgID },
            returning: true,
          },
        );
        return {
          message: 'Company config updated successfully',
          data: config?.[1]?.[0],
        };
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async delete(id: string): Promise<GenericResponse<null>> {
    try {
      await this.companyConfigModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'Company Config deleted successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async deleteByConfigId(
    id: string,
    orgID: any,
  ): Promise<GenericResponse<null>> {
    try {
      await this.companyConfigModel.destroy({
        where: {
          configID: id,
          orgID: orgID,
        },
      });
      return {
        message: 'Company Config deleted successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findByConfigId(configID: string, orgID: string): Promise<any> {
    return this.companyConfigModel.findOne({
      where: {
        configID,
        orgID,
      },
    });
  }
}
