import {
  BadRequestException,
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
import { UpdateProcessInput } from '../dtos/update-process-input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Sequelize } from 'sequelize-typescript';
import { CreateProcessInput } from '../dtos/create-process-input.dto';
import { ProcessFilterInput } from '../dtos/process-filter-input.dto';
import { Process } from '../models/process.model';
import { TeamService } from 'src/team/services/team.service';
import { Op } from 'sequelize';
import { EventLogService } from 'src/eventlog/eventlog.service';
@Injectable()
export class ProcessService {
  private logger = new Logger(ProcessService.name);
  constructor(
    @InjectModel(Process)
    private processModel: typeof Process,
    private readonly sequelize: Sequelize,
    private teamService: TeamService,
    private eventlogService: EventLogService,
  ) {}

  async create(
    createProcessInput: CreateProcessInput,
    user: any,
  ): Promise<GenericResponse<Process>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.processModel,
        ['name'],
        createProcessInput,
        '',
        user?.orgID,
      );

      handleErrors(validationErrors, 'unique');
      const process = await this.processModel.create({
        ...createProcessInput,
        orgID: user?.orgID,
      });
      const eventPayload = JSON.parse(JSON.stringify(createProcessInput));
      const eventLog = {
        objectType: 'Process',
        changeType: 'add',
        objectID: process.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: process,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Process created successfully',
        data: process,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAll(
    processFilterInput: ProcessFilterInput,
    user: any,
  ): Promise<PaginatedList<Process>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        search,
        sortOrder = SortOrder.ASC,
      } = processFilterInput;
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
      const process = await this.processModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,
      });
      return {
        totalItems: process.count,
        items: process.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string, user: any): Promise<GenericResponse<Process>> {
    try {
      const whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.id = id;
      const process = await this.processModel.findOne({
        where: whereClause,
      });
      if (process)
        return {
          message: 'Process found',
          data: process,
        };
      else throw new NotFoundException('Invalid Process id');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateProcessInput: UpdateProcessInput,
    user: any,
  ): Promise<any> {
    try {
      const processById = await this.findOne(id, user);
      const validationErrors = await uniqueFieldsCheck(
        this.processModel,
        ['name'],
        updateProcessInput,
        id,
        user?.orgID,
      );
      handleErrors(validationErrors, 'unique');
      const process = await this.processModel.update(updateProcessInput, {
        where: { id },
        returning: true,
      });
      const eventPayload = JSON.parse(JSON.stringify(updateProcessInput));
      const eventLog = {
        objectType: 'Process',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: processById.data,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        status: true,
        message: 'Process updated successfully',
        data: process?.[1]?.[0],
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
      const processExists = await this.teamService.findProcess(id);

      if (processExists) {
        throw new BadRequestException(
          'Deletion is not permitted as there are process currently associated with this team.',
        );
      } else {
        const response = await this.processModel.destroy({
          where: {
            id,
          },
        });
        if (response !== 0) {
          const eventLog = {
            objectType: 'Process',
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
            message: 'Process deleted successfully',
            data: null,
          };
        } else throw new NotFoundException(`Process not found`);
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
