import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { City } from '../models/city.model';
import { CreateCityInput } from '../dtos/create-city-input-dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { CityFilterInput } from '../dtos/city-filter-input-dto';
import { SortOrder } from 'src/shared/enums';
import { Op } from 'sequelize';
import { UpdateCityInput } from '../dtos/update-city-input-dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Organization } from 'src/organization/models/organization.model';

@Injectable()
export class CityService {
  constructor(
    @InjectModel(City) private cityModel: typeof City,
    @InjectModel(Organization) private organizationModel: typeof Organization,
    private eventlogService: EventLogService,
  ) {}

  async create(
    createCityInput: CreateCityInput,
    currentUser: any,
  ): Promise<GenericResponse<City>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.cityModel,
        ['name'],
        createCityInput,
      );

      handleErrors(validationErrors, 'unique');
      const city = await this.cityModel.create({
        ...createCityInput,
      });

      const eventPayload = JSON.parse(JSON.stringify(createCityInput));
      const eventLog = {
        objectType: 'City',
        changeType: 'add',
        objectID: city.id,
        authID: currentUser.id,
        updatedBy: currentUser.name,
        payload: city,
        requestPayload: eventPayload,
        user: currentUser,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'City created successfully',
        data: city,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    cityFilterInput: CityFilterInput,
  ): Promise<PaginatedList<City>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = cityFilterInput;

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

      const city = await this.cityModel.findAndCountAll({
        attributes: ['name', 'id', 'state'],
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      return {
        totalItems: city.count,
        items: city.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<City>> {
    try {
      const city = await this.cityModel.findOne({
        where: { id },
      });
      if (city)
        return {
          message: 'City found',
          data: city,
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
    updateCityInput: UpdateCityInput,
    user: any,
  ): Promise<any> {
    try {
      const { name } = updateCityInput;
      const existingCity = await this.cityModel.findOne({
        where: {
          name: name,
          id: { [Op.ne]: id },
        },
      });

      if (existingCity) {
        throw new NotFoundException('A city with this name already exists.');
      }
      const cityById = await this.findOne(id);
      const city = await this.cityModel.update(updateCityInput, {
        where: { id },
        returning: true,
      });
      const eventPayload = JSON.parse(JSON.stringify(updateCityInput));
      const eventLog = {
        objectType: 'City',
        changeType: 'edit',
        objectID: id,
        authID: user?.id,
        updatedBy: user?.name,
        payload: cityById?.data,
        requestPayload: eventPayload,
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: 'City updated successfully',
        data: city?.[1]?.[0],
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
      const cityInOrg = await this.organizationModel.findOne({
        where: { cityID: id },
      });

      if (cityInOrg) {
        throw new NotFoundException(
          'Cannot delete city as it is being used by one or more organizations.',
        );
      }
      const eventLog = {
        objectType: 'City',
        changeType: 'delete',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        payload: '',
        requestPayload: id,
        user,
      };
      this.eventlogService.create(eventLog);
      await this.cityModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'City deleted successfully',
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
