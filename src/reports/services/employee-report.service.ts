import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { Employee } from 'src/employee/models/employee.model';

@Injectable()
export class EmployeeReportService {
  private logger = new Logger(EmployeeReportService.name);

  constructor(
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
  ) {}

  async getEmployeeAttritionReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<Employee>> {
    try {
      const { filters, skip, take, sortBy, sortOrder } = reportFilterInput;
      const { dateRange } = filters;

      const whereCondition: any = {};
      whereCondition.orgID = user.orgID;
      if (dateRange) {
        whereCondition.exitDate = {
          [Op.between]: [dateRange.startDate, dateRange.endDate],

          //   [Op.between]: [
          //     new Date(dateRange.startDate),
          //     new Date(dateRange.endDate),
          //   ],
        };
      }

      const employees = await this.employeeModel.findAndCountAll({
        where: whereCondition,
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
      });
      // Map exit boolean → text
      const mappedRows = employees.rows.map((emp: any) => {
        const data = emp.toJSON();
        return {
          ...data,
          exitStatus: data.exit ? 'Relieved' : 'Active',
        };
      });
      return {
        totalItems: employees.count,
        items: mappedRows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getNewEmployeeReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<Employee>> {
    try {
      const {
        filters = {},
        skip = 0,
        take = 10,
        sortBy = 'joinedDate',
        sortOrder = 'ASC',
      } = reportFilterInput || {};

      const { dateRange } = filters || {};

      const whereCondition: any = {
        orgID: user.orgID,
        employeeType: 'Employee',
      };
      if (dateRange) {
        whereCondition.joinedDate = {
          [Op.between]: [
            // new Date(dateRange.startDate),
            // new Date(dateRange.endDate),
            dateRange.startDate,
            dateRange.endDate,
          ],
        };
      }

      const employees = await this.employeeModel.findAndCountAll({
        where: whereCondition,
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
      });

      const mappedRows = employees.rows.map((emp: any) => {
        const data = emp.toJSON();
        return {
          ...data,
        };
      });

      return {
        totalItems: employees.count,
        items: mappedRows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
