import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { Employee } from 'src/employee/models/employee.model';
import { SortOrder } from 'src/shared/enums';

@Injectable()
export class EmployeeReportExportService {
  private logger = new Logger(EmployeeReportExportService.name);

  constructor(
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
  ) {}

  async getEmployeeAttritionReport(
    exportFilters: any,
    user: any,
  ): Promise<PaginatedList<Employee>> {
    try {
      const { dateRange } = exportFilters.exportFilters;
      const whereCondition: any = {};
      whereCondition.orgID = user.orgID;
      if (dateRange) {
        whereCondition.exitDate = {
          [Op.between]: [
            new Date(dateRange.startDate),
            new Date(dateRange.endDate),
          ],
        };
      }

      const employees = await this.employeeModel.findAndCountAll({
        where: whereCondition,
        order: [['exitDate', SortOrder.DESC]],
        // limit: take,
        // offset: skip * take,
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
    exportFilters: any,
    user: any,
  ): Promise<PaginatedList<Employee>> {
    try {
      const { dateRange } = exportFilters.exportFilters;
      const whereCondition: any = {
        orgID: user.orgID,
        employeeType: 'Employee',
      };
      if (dateRange) {
        whereCondition.joinedDate = {
          [Op.between]: [
            new Date(dateRange.startDate),
            new Date(dateRange.endDate),
          ],
        };
      }

      const employees = await this.employeeModel.findAndCountAll({
        where: whereCondition,
        order: [['joinedDate', SortOrder.DESC]],
        // limit: take,
        // offset: skip * take,
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
