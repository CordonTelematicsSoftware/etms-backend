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
import { SortOrder } from 'src/shared/enums';
import { Op } from 'sequelize';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { ReportScheduler } from '../models/report-scheduler.model';
import { Organization } from 'src/organization/models/organization.model';
import { CreateReportSchedulerDto } from '../dtos/create-report-scheduler-input.dto';
import { ReportSchedulerFilterInput } from '../dtos/report-scheduler-filter.dto';
import { UpdateReportSchedulerInput } from '../dtos/update-report-scheduler.dto';
import { Employee } from 'src/employee/models/employee.model';
// import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Injectable()
export class ReportSchedulerService {
  constructor(
    @InjectModel(ReportScheduler)
    private reportSchedulerModel: typeof ReportScheduler,
    @InjectModel(Organization) private organizationModel: typeof Organization,
    private eventlogService: EventLogService,
  ) {}

  async create(
    reportSchedulerInput: CreateReportSchedulerDto,
    currentUser: any,
  ): Promise<GenericResponse<ReportScheduler>> {
    try {
      const existingScheduler = await this.reportSchedulerModel.findOne({
        where: {
          reportName: reportSchedulerInput.reportName,
          orgID: currentUser.orgID,
        },
      });

      if (existingScheduler) {
        throw new InternalServerErrorException(
          'Report scheduler with this report name already exists',
        );
      }
      const reportScheduler = await this.reportSchedulerModel.create({
        ...reportSchedulerInput,
        orgID: currentUser.orgID,
      });
      const eventPayload = JSON.parse(JSON.stringify(reportSchedulerInput));
      const eventLog = {
        objectType: 'Report Scheduler',
        changeType: 'add',
        objectID: reportScheduler.id,
        authID: currentUser.id,
        updatedBy: currentUser.name,
        payload: reportScheduler,
        requestPayload: eventPayload,
        user: currentUser,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Report scheduler created successfully',
        data: reportScheduler,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    reportSchedulerFilterInput: ReportSchedulerFilterInput,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = reportSchedulerFilterInput;

      let whereClause: any = {};
      whereClause.orgID = user.orgID;
      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            {
              reportName: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }
      const reportScheduler = await this.reportSchedulerModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      return {
        totalItems: reportScheduler.count,
        items: reportScheduler.rows,
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
    user?: any,
  ): Promise<GenericResponse<ReportScheduler>> {
    try {
      const whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.id = id;
      const reportScheduler = await this.reportSchedulerModel.findOne({
        where: whereClause,
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'name', 'employeeCode'],
          },
        ],
      });
      if (reportScheduler)
        return {
          message: 'Report scheduler found',
          data: reportScheduler,
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
    updateReportSchedulerInput: UpdateReportSchedulerInput,
    user: any,
  ): Promise<any> {
    try {
      const reportScheduler = await this.reportSchedulerModel.findOne({
        where: { id: id, orgID: user.orgID },
      });

      if (!reportScheduler) {
        throw new NotFoundException('Report scheduler not found');
      }
      const updatedReportScheduler = await this.reportSchedulerModel.update(
        updateReportSchedulerInput,
        {
          where: { id, orgID: user.orgID },
          returning: true,
        },
      );
      const eventPayload = JSON.parse(
        JSON.stringify(updateReportSchedulerInput),
      );
      const eventLog = {
        objectType: 'Report Scheduler',
        changeType: 'edit',
        objectID: id,
        authID: user?.id,
        updatedBy: user?.name,
        payload: updatedReportScheduler,
        requestPayload: eventPayload,
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        status: true,
        message: 'Report scheduler updated successfully',
        data: updatedReportScheduler?.[1]?.[0],
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
      const reportScheduler = await this.reportSchedulerModel.findOne({
        where: { id },
      });

      if (!reportScheduler) {
        throw new NotFoundException('Report scheduler not found.');
      }
      const eventLog = {
        objectType: 'Report Scheduler',
        changeType: 'delete',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        payload: '',
        requestPayload: id,
        user,
      };
      this.eventlogService.create(eventLog);
      await this.reportSchedulerModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'Report scheduler deleted successfully',
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
