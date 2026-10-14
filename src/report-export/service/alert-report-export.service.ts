import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { Employee } from 'src/employee/models/employee.model';
import { Alert } from 'src/alerts/models/alert.model';
import { Driver } from 'src/drivers/models/driver.model';
import moment = require('moment');
import { NotificationLog } from 'src/notifications/models/notification-log.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { Team } from 'src/team/models/team.model';
import { Process } from 'src/process/models/process.model';
import { Costcenter } from 'src/costcenter/model/costcenter.model';
import { SafeHomeIVRHistory } from 'src/IVR-calling/models/safeHomeIVRHistory.model';

@Injectable()
export class AlertReportExportService {
  private logger = new Logger(AlertReportExportService.name);

  constructor(
    @InjectModel(Alert)
    private alertModel: typeof Alert,
    @InjectModel(NotificationLog)
    private notificationLog: typeof NotificationLog,
    @InjectModel(SafeHomeIVRHistory)
    private safehomeIVRHistoryModel: typeof SafeHomeIVRHistory,
  ) {}

  async getPanicReport(
    exportFilters: any,
    user: any,
  ): Promise<PaginatedList<Alert>> {
    try {
      const { dateRange, alertTypes } = exportFilters.exportFilters;

      const whereCondition: any = {};
      whereCondition.orgID = user.orgID;
      if (dateRange) {
        const startDate = new Date(dateRange.startDate);
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end day

        whereCondition.createdAt = {
          [Op.between]: [startDate, endDate],
        };
      }

      if (alertTypes && alertTypes.length > 0) {
        whereCondition.type = { [Op.in]: alertTypes };
      }

      const alerts = await this.alertModel.findAndCountAll({
        where: whereCondition, //
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['name', 'id'],
            required: false,
          },
          {
            model: Driver,
            as: 'driver',
            attributes: ['name', 'id'],
            required: false,
          },
          {
            model: Trip,
            as: 'trip',
            attributes: ['id'],
            required: false,
            include: [
              {
                model: Driver,
                as: 'driver',
                attributes: ['name', 'id'],
                required: false,
              },
            ],
          },
        ],
      });
      const formattedItems = alerts.rows.map((item: any) => {
        let createdAt = '';
        if (item.createdAt) {
          const date = moment(item.createdAt).format('DD-MM-YYYY');
          const time = moment(item.createdAt).format('HH:mm');
          createdAt = `${date} (${time})`;
        }

        let acknowledgedAt = '';
        if (item.acknowledgedDate) {
          const date = moment(item.acknowledgedDate).format('DD-MM-YYYY');
          const time = item.acknowledgedTime
            ? moment(item.acknowledgedTime, 'HH:mm:ss').format('HH:mm')
            : '';
          acknowledgedAt = time ? `${date} (${time})` : date;
        }

        const data = item.toJSON();

        return {
          ...data,
          createdAt,
          acknowledgedAt,
          driver: {
            ...(data.driver || {}),
            name: data.driver?.name || data.trip?.driver?.name || null,
          },
          employee: {
            ...(data.employee || {}),
            name:
              data.source === 'Driver' ? 'N/A' : data.employee?.name ?? null,
          },
          type: data.type ? data.type.toUpperCase() : data.type,
        };
      });

      return {
        totalItems: alerts.count,
        items: formattedItems,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getSMSReport(
    exportFilters: any,
    user: any,
  ): Promise<PaginatedList<NotificationLog>> {
    try {
      const { dateRange } = exportFilters.exportFilters;

      const whereCondition: any = {};
      whereCondition.channel = 'sms';
      whereCondition.organizationId = user.orgID;

      if (dateRange) {
        const startDate = new Date(dateRange.startDate);
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end day

        whereCondition.createdAt = {
          [Op.between]: [startDate, endDate],
        };
      }
      const alerts = await this.notificationLog.findAndCountAll({
        where: whereCondition,
        include: [
          {
            model: Employee,
            as: 'employee',
            required: false,
            include: [
              {
                model: Team,
                as: 'team',
                required: false,
              },
              {
                model: Process,
                as: 'process',
                required: false,
              },
              {
                model: Costcenter,
                as: 'costcenter',
                required: false,
              },
            ],
          },
          {
            model: Trip,
            as: 'trip',
            required: false,
          },
        ],
        //   order: [[sortBy, sortOrder]],
        //   limit: take,
        //   offset: skip * take,
      });
      const formattedItems = alerts.rows.map((item: any) => {
        let sentAt = '';
        if (item.sentAt) {
          const date = moment(item.sentAt).format('DD-MM-YYYY');
          const time = moment(item.sentAt).format('HH:mm');
          sentAt = `${date} (${time})`;
        }

        return {
          ...item.toJSON(),
          sentAt,
          //   retryCount: (item.retryCount || 0) + 1,
        };
      });
      return {
        totalItems: alerts.count,
        items: formattedItems,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getIVRReport(
    exportFilters: any,
    user: any,
  ): Promise<PaginatedList<SafeHomeIVRHistory>> {
    try {
      const { dateRange } = exportFilters.exportFilters;

      const whereCondition: any = {};
      whereCondition.orgID = user.orgID;

      if (dateRange) {
        const startDate = new Date(dateRange.startDate);
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end day

        whereCondition.createdAt = {
          [Op.between]: [startDate, endDate],
        };
      }
      const alerts = await this.safehomeIVRHistoryModel.findAndCountAll({
        where: whereCondition,
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['name', 'id', 'employeeCode'],
            required: false,
            include: [
              {
                model: Team,
                as: 'team',
                required: false,
                attributes: ['id', 'name'],
              },
              {
                model: Process,
                as: 'process',
                required: false,
                attributes: ['id', 'name'],
              },
              {
                model: Costcenter,
                as: 'costcenter',
                required: false,
                attributes: ['id', 'name'],
              },
            ],
          },
          {
            model: Trip,
            as: 'trip',
            attributes: ['id', 'pickDrop', 'shiftTime'],
            required: false,
            include: [
              {
                model: Driver,
                as: 'driver',
                required: false,
                attributes: ['id', 'name'],
              },
            ],
          },
        ],
      });
      const formatDuration = (seconds: number | string) => {
        const totalSeconds = Number(seconds) || 0;
        const minutes = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;

        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(
          2,
          '0',
        )}`;
      };

      const formattedItems = alerts.rows.map((item: any) => {
        const data = item.toJSON();

        let initiatorNumber: string;
        let receiverNumber: string;
        let initiatorType: string;
        let callTypeLabel: string;

        switch (data.callType) {
          case 'EMPLOYEE_TO_DRIVER':
            initiatorNumber = data.employeePhone;
            receiverNumber = data.driverPhone;
            initiatorType = 'Employee';
            callTypeLabel = 'Employee to Driver';
            break;
          case 'DRIVER_TO_EMPLOYEE':
            initiatorNumber = data.driverPhone;
            receiverNumber = data.employeePhone;
            initiatorType = 'Driver';
            callTypeLabel = 'Driver to Employee';
            break;
          case 'EMPLOYEE_TO_HELPDESK':
            initiatorNumber = data.employeePhone;
            receiverNumber = data.helpdeskPhone;
            initiatorType = 'Employee';
            callTypeLabel = 'Employee to Helpdesk';
            break;
          case 'DRIVER_TO_HELPDESK':
            initiatorNumber = data.driverPhone;
            receiverNumber = data.helpdeskPhone;
            initiatorType = 'Driver';
            callTypeLabel = 'Driver to Helpdesk';
            break;
          case 'EMPLOYEE_TO_COPASSENGER':
            callTypeLabel = 'Employee to Co-Passenger';
            initiatorType = 'Employee';
            initiatorNumber = data.employeePhone;
            receiverNumber = data.coPassengerPhone;
            break;
          default:
            // Preserves old fallback behavior for SAFE_HOME / anything unrecognized
            initiatorNumber = data.driverPhone;
            receiverNumber = data.employeePhone;
            initiatorType = 'Driver';
            callTypeLabel = 'Safe Home';
            break;
        }

        return {
          ...data,
          initiatorNumber,
          receiverNumber,
          initiatorType,
          callTypeLabel,
          formattedCallDuration: formatDuration(data.callDuration),
          formattedCallCost: `₹${Number(data.callCost || 0).toFixed(2)}`,
          // Keep this format identical to the grid builder
          // (reports/services/alert-report.service.ts) — the IVR report's grid
          // and export are separate implementations, so they drift silently.
          formattedDate: moment(data.createdAt).format('YYYY-MM-DD HH:mm'),
        };
      });
      return {
        totalItems: alerts.count,
        items: formattedItems,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
