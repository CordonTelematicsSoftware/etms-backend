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

import { GrievanceHistory } from '../models/grievanceHistory.model';
import { Employee } from 'src/employee/models/employee.model';
import { FilterGrievanceHistoryInput } from '../dtos/filter-grievanceHistory-input.dto';
import { SortOrder } from 'src/shared/enums';
import { Op } from 'sequelize';

@Injectable()
export class GrievanceHistoryService {
  constructor(
    @InjectModel(GrievanceHistory)
    private grievanceHistoryModel: typeof GrievanceHistory,
  ) {}

  async findAll(
    id: bigint,
    filterGrievanceHistoryInput: FilterGrievanceHistoryInput,
  ): Promise<PaginatedList<GrievanceHistory>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        status,
      } = filterGrievanceHistoryInput;

      let whereClause: any = {};
      if (status) {
        whereClause.status = status;
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
      }

      whereClause.grievanceId = id;
      const grievanceHistory = await this.grievanceHistoryModel.findAndCountAll(
        {
          where: whereClause,
          order: [[`${sortBy}`, `${sortOrder}`]],
          limit: take,
          offset: skip * take,
          include: [
            { model: Employee, as: 'updatedBy', attributes: ['name'] },
            { model: Employee, as: 'createdBy', attributes: ['name'] },
          ],
        },
      );
      if (grievanceHistory) {
        return {
          totalItems: grievanceHistory.count,
          items: grievanceHistory.rows,
        };
      } else {
        throw new NotFoundException('Grievance History not found');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: bigint): Promise<GenericResponse<GrievanceHistory>> {
    try {
      const whereClause: any = {};

      whereClause.grievanceId = id;
      const history = await this.grievanceHistoryModel.findOne({
        where: whereClause,
        include: [
          { model: Employee, as: 'updatedBy', attributes: ['name'] },
          { model: Employee, as: 'createdBy', attributes: ['name'] },
        ],
      });
      if (history) {
        return {
          message: 'Grievance history found',
          data: history,
        };
      } else {
        throw new NotFoundException('Grievance history found not found');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
