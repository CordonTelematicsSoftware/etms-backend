import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { SortOrder } from 'src/shared/enums';
import { UpdateCostcenterInput } from '../dtos/update-cost-center-input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { CreateCostcenterInput } from '../dtos/create-costcenter-input.dto';
import { CostcenterFilterInput } from '../dtos/cost-center-filter-input.dto';
import { Costcenter } from '../model/costcenter.model';
import { Process } from 'src/process/models/process.model';
import { Team } from 'src/team/models/team.model';
import { EventLogService } from 'src/eventlog/eventlog.service';

@Injectable()
export class CostcenterService {
  private logger = new Logger(CostcenterService.name);
  constructor(
    @InjectModel(Costcenter)
    private costcenterModel: typeof Costcenter,
    private readonly sequelize: Sequelize,
    private eventlogService: EventLogService,
  ) {}

  async create(
    createCostcenterInput: CreateCostcenterInput,
    user: any,
  ): Promise<GenericResponse<Costcenter>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.costcenterModel,
        ['name'],
        createCostcenterInput,
        '',
        user?.orgID,
      );

      handleErrors(validationErrors, 'unique');
      const costcenter = await this.costcenterModel.create({
        ...createCostcenterInput,
        orgID: user?.orgID,
      });
      const eventPayload = JSON.parse(JSON.stringify(createCostcenterInput));
      const eventLog = {
        objectType: 'Cost Center',
        changeType: 'add',
        objectID: costcenter.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: costcenter,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Costcenter created successfully',
        data: costcenter,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAll(
    costcenterFilterInput: CostcenterFilterInput,
    user: any,
  ): Promise<PaginatedList<Costcenter>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        search,
        sortOrder = SortOrder.ASC,
      } = costcenterFilterInput;
      let whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      if (search) {
        whereClause = {
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
        whereClause.orgID = user.orgID;
      }

      const costcenter = await this.costcenterModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        where: whereClause,
        offset: skip * take,
        include: [
          {
            model: Process,
            as: 'process',
            attributes: ['id', 'name'],
          },
          {
            model: Team,
            as: 'team',
            attributes: ['id', 'name'],
          },
        ],
        subQuery: false,
      });
      return {
        totalItems: costcenter.count,
        items: costcenter.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string, user: any): Promise<GenericResponse<Costcenter>> {
    try {
      const whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.id = id;
      const costcenter = await this.costcenterModel.findOne({
        where: whereClause,
        include: [
          {
            model: Process,
            as: 'process',
            attributes: ['id', 'name'],
          },
          {
            model: Team,
            as: 'team',
            attributes: ['id', 'name'],
          },
        ],
      });
      if (costcenter)
        return {
          message: 'Cost center found',
          data: costcenter,
        };
      else throw new NotFoundException('Invalid Costcenter id');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateCostcenterInput: UpdateCostcenterInput,
    user: any,
  ): Promise<any> {
    try {
      const costcenterById = await this.findOne(id, user);
      const costcenter = await this.costcenterModel.update(
        updateCostcenterInput,
        {
          where: { id },
          returning: true,
        },
      );
      const eventPayload = JSON.parse(JSON.stringify(updateCostcenterInput));
      const eventLog = {
        objectType: 'Cost Center',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: costcenterById.data,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        status: true,
        message: 'Cost center updated successfully',
        data: costcenter?.[1]?.[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async softDelete(id: string, user: any): Promise<GenericResponse<null>> {
    try {
      const response = await this.costcenterModel.destroy({
        where: {
          id,
        },
      });
      if (response !== 0) {
        const eventLog = {
          objectType: 'Cost center',
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
        return {
          message: 'Cost center deleted successfully',
          data: null,
        };
      } else throw new NotFoundException(`Cost center not found`);
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
