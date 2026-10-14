import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Model, Op, QueryTypes } from 'sequelize';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { Alert } from 'src/alerts/models/alert.model';
import { Employee } from 'src/employee/models/employee.model';
import { Driver } from 'src/drivers/models/driver.model';
import { NotificationLog } from 'src/notifications/models/notification-log.model';
import { SafeHomeIVRHistory } from 'src/IVR-calling/models/safeHomeIVRHistory.model';
import { Team } from 'src/team/models/team.model';
import { Process } from 'src/process/models/process.model';
import { Costcenter } from 'src/costcenter/model/costcenter.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import moment = require('moment');
import { Sequelize } from 'sequelize-typescript'; // or 'sequelize', matching whatever the rest of your codebase imports
import { InjectConnection } from '@nestjs/sequelize';

@Injectable()
export class AlertReportService {
  private logger = new Logger(AlertReportService.name);

  constructor(
    @InjectModel(Alert)
    private alertModel: typeof Alert,

    @InjectModel(NotificationLog)
    private notificationLog: typeof NotificationLog,

    @InjectModel(SafeHomeIVRHistory)
    private safeHomeIVRHistory: typeof SafeHomeIVRHistory,

    @InjectModel(Employee)
    private employee: typeof Employee,

    @InjectConnection()
    private readonly sequelize: Sequelize,
  ) {}
  async getPanicReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<Alert>> {
    try {
      const { filters, skip, take, sortBy, sortOrder } = reportFilterInput;
      const { dateRange, alertTypes } = filters;

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

      // filter by type
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
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
      });

      const formattedItems = alerts.rows.map((item: any) => {
        const data = item.toJSON();

        return {
          ...data,
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
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<NotificationLog>> {
    try {
      const { filters, skip, take, sortBy, sortOrder } = reportFilterInput;
      const { dateRange } = filters;

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
      const sms = await this.notificationLog.findAndCountAll({
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
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
      });
      const alerts = sms.rows.map((item: any) => ({
        ...item.toJSON(),
        renderedBody: this.notApplicable(
          this.maskSensitiveCodes(item.renderedBody),
        ),
        sentAt: item.sentAt
          ? `${moment(item.sentAt).format('DD-MM-YYYY')} (${moment(
              item.sentAt,
            ).format('HH:mm')})`
          : 'N/A',
        status: item.status
          ? item.status.charAt(0).toUpperCase() +
            item.status.slice(1).toLowerCase()
          : 'N/A',
        smsCost: this.notApplicable(item.smsCost),
        smsCount: this.notApplicable(item.smsCount),
        employeeName: this.notApplicable(item.employee?.name),
        employeeCode: this.notApplicable(item.employee?.employeeCode),
        driverName: this.notApplicable(item.trip?.driver?.name),
        tripID: this.notApplicable(item.trip?.id),
        pickDrop: this.notApplicable(item.trip?.pickDrop),
        shiftTime: this.notApplicable(item.trip?.shiftTime),
        employeeId: this.notApplicable(item.employee?.id),
        team: this.notApplicable(item.employee?.team?.name),
        process: this.notApplicable(item.employee?.process?.name),
        costcenter: this.notApplicable(item.employee?.costcenter?.name),
      }));

      return {
        totalItems: sms.count,
        items: alerts,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getIVRReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<SafeHomeIVRHistory>> {
    try {
      const { filters, skip, take, sortBy, sortOrder } = reportFilterInput;
      const { dateRange } = filters;

      const whereCondition: any = {};
      // whereCondition.channel = "sms";
      whereCondition.orgID = user.orgID;

      if (dateRange) {
        const startDate = new Date(dateRange.startDate);
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end day

        whereCondition.createdAt = {
          [Op.between]: [startDate, endDate],
        };
      }
      const alerts = await this.safeHomeIVRHistory.findAndCountAll({
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
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
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
          driverName: this.notApplicable(data?.trip?.driver?.name),
          employeeId: this.notApplicable(data?.employee?.id),
          employeeName: this.notApplicable(data?.employee?.name),
          employeeCode: this.notApplicable(data?.employee?.employeeCode),
          tripId: this.notApplicable(data?.trip?.id),
          shiftTime: this.notApplicable(data?.trip?.shiftTime),
          pickDrop: this.notApplicable(data?.trip?.pickDrop),

          initiatorNumber: this.notApplicable(initiatorNumber),
          receiverNumber: this.notApplicable(receiverNumber),
          initiatorType: this.notApplicable(initiatorType),
          callTypeLabel: this.notApplicable(callTypeLabel),
          formattedCallDuration: this.notApplicable(
            data.callDuration ? formatDuration(data?.callDuration) : null,
          ),
          formattedCallCost: this.notApplicable(
            data.callCost != null
              ? `₹${Number(data?.callCost).toFixed(2)}`
              : null,
          ),
          recordingUrl: this.notApplicable(data?.recordingUrl),
          formattedDate: this.notApplicable(
            data.createdAt
              ? moment(data?.createdAt).format('YYYY-MM-DD HH:mm')
              : null,
          ),
          callCount: this.notApplicable(data?.callCount),
          employeeTeam: this.notApplicable(data?.employee?.team?.name),
          employeeProcess: this.notApplicable(data?.employee?.process?.name),
          employeeCostCenter: this.notApplicable(
            data?.employee?.costcenter?.name,
          ),
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
  //   async getIVRReport(
  //     reportFilterInput: any,
  //     user: any,
  //   ): Promise<PaginatedList<SafeHomeIVRHistory>> {
  //     try {
  //       const { filters, skip, take, sortBy, sortOrder } = reportFilterInput;
  //       const { dateRange } = filters;

  //       const whereCondition: any = {};
  //       whereCondition.orgID = user.orgID;

  //       let startDate: Date | undefined;
  //       let endDate: Date | undefined;

  //       if (dateRange) {
  //         startDate = new Date(dateRange.startDate);
  //         endDate = new Date(dateRange.endDate);
  //         endDate.setHours(23, 59, 59, 999);

  //         whereCondition.createdAt = {
  //           [Op.between]: [startDate, endDate],
  //         };
  //       }

  //       // --- Step 1: dedupe via raw SQL window functions ---
  //       // Groups rows for the same employeePhone+driverPhone+callType that occur
  //       // within DEDUPE_WINDOW_SECONDS of each other into one "session", then
  //       // keeps only the best row per session (highest duration wins; ties
  //       // broken by most recent createdAt).
  //       const DEDUPE_WINDOW_SECONDS = 60;

  //       const replacements: any = {
  //         orgID: user.orgID,
  //         windowSeconds: DEDUPE_WINDOW_SECONDS,
  //       };
  //       let dateFilterSql = '';
  //       if (startDate && endDate) {
  //         dateFilterSql = `AND "createdAt" BETWEEN :startDate AND :endDate`;
  //         replacements.startDate = startDate;
  //         replacements.endDate = endDate;
  //       }

  //       const dedupeSql = `
  //   WITH ordered AS (
  //     SELECT
  //       "id",
  //       "employeePhone",
  //       "driverPhone",
  //       "callType",
  //       "createdAt",
  //       "callDuration",
  //       LAG("createdAt") OVER (
  //         PARTITION BY "employeePhone", "driverPhone", "callType"
  //         ORDER BY "createdAt"
  //       ) AS prev_created_at
  //     FROM "SafeHomeIVRHistories"
  //     WHERE "orgID" = :orgID
  //     ${dateFilterSql}
  //   ),
  //   sessioned AS (
  //     SELECT
  //       *,
  //       SUM(
  //         CASE
  //           WHEN prev_created_at IS NULL
  //             OR EXTRACT(EPOCH FROM ("createdAt" - prev_created_at)) > :windowSeconds
  //           THEN 1 ELSE 0
  //         END
  //       ) OVER (
  //         PARTITION BY "employeePhone", "driverPhone", "callType"
  //         ORDER BY "createdAt"
  //       ) AS session_id
  //     FROM ordered
  //   ),
  //   ranked AS (
  //     SELECT
  //       "id",
  //       ROW_NUMBER() OVER (
  //         PARTITION BY "employeePhone", "driverPhone", "callType", session_id
  //         ORDER BY COALESCE(NULLIF("callDuration", '')::numeric, 0) DESC, "createdAt" DESC
  //       ) AS rn
  //     FROM sessioned
  //   )
  //   SELECT "id" FROM ranked WHERE rn = 1
  // `;

  //       const dedupedRows: { id: number }[] = await this.sequelize.query(dedupeSql, {
  //         replacements,
  //         type: QueryTypes.SELECT,
  //       });
  //       const dedupedIds = dedupedRows.map((r) => r.id);

  //       if (dedupedIds.length === 0) {
  //         return { totalItems: 0, items: [] };
  //       }

  //       whereCondition.id = { [Op.in]: dedupedIds };

  //       // --- Step 2: count + paginated fetch, scoped to deduped ids only ---
  //       const [totalItems, rows] = await Promise.all([
  //         this.safeHomeIVRHistory.count({ where: whereCondition }),
  //         this.safeHomeIVRHistory.findAll({
  //           where: whereCondition,
  //           include: [
  //             {
  //               model: Employee,
  //               as: 'employee',
  //               attributes: ['name', 'id', 'employeeCode'],
  //               required: false,
  //               include: [
  //                 { model: Team, as: 'team', required: false, attributes: ['id', 'name'] },
  //                 { model: Process, as: 'process', required: false, attributes: ['id', 'name'] },
  //                 { model: Costcenter, as: 'costcenter', required: false, attributes: ['id', 'name'] },
  //               ],
  //             },
  //             {
  //               model: Trip,
  //               as: 'trip',
  //               attributes: ['id', 'pickDrop', 'shiftTime'],
  //               required: false,
  //               include: [
  //                 { model: Driver, as: 'driver', required: false, attributes: ['id', 'name'] },
  //               ],
  //             },
  //           ],
  //           order: [[sortBy, sortOrder]],
  //           limit: take,
  //           offset: skip * take,
  //         }),
  //       ]);

  //       const formatDuration = (seconds: number | string) => {
  //         const totalSeconds = Number(seconds) || 0;
  //         const minutes = Math.floor(totalSeconds / 60);
  //         const secs = totalSeconds % 60;

  //         return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(
  //           2,
  //           '0',
  //         )}`;
  //       };

  //       const formattedItems = rows.map((item: any) => {
  //         const data = item.toJSON();

  //         let initiatorNumber: string;
  //         let receiverNumber: string;
  //         let initiatorType: string;
  //         let callTypeLabel: string;

  //         switch (data.callType) {
  //           case 'EMPLOYEE_TO_DRIVER':
  //             initiatorNumber = data.employeePhone;
  //             receiverNumber = data.driverPhone;
  //             initiatorType = 'Employee';
  //             callTypeLabel = 'Employee to Driver';
  //             break;
  //           case 'DRIVER_TO_EMPLOYEE':
  //             initiatorNumber = data.driverPhone;
  //             receiverNumber = data.employeePhone;
  //             initiatorType = 'Driver';
  //             callTypeLabel = 'Driver to Employee';
  //             break;
  //           case 'EMPLOYEE_TO_HELPDESK':
  //             initiatorNumber = data.employeePhone;
  //             receiverNumber = data.helpdeskPhone;
  //             initiatorType = 'Employee';
  //             callTypeLabel = 'Employee to Helpdesk';
  //             break;
  //           case 'DRIVER_TO_HELPDESK':
  //             initiatorNumber = data.driverPhone;
  //             receiverNumber = data.helpdeskPhone;
  //             initiatorType = 'Driver';
  //             callTypeLabel = 'Driver to Helpdesk';
  //             break;
  //           case 'EMPLOYEE_TO_COPASSENGER':
  //             callTypeLabel = 'Employee to Co-Passenger';
  //             initiatorType = 'Employee';
  //             initiatorNumber = data.employeePhone;
  //             receiverNumber = data.coPassengerPhone;
  //             break;
  //           default:
  //             // Preserves old fallback behavior for SAFE_HOME / anything unrecognized
  //             initiatorNumber = data.driverPhone;
  //             receiverNumber = data.employeePhone;
  //             initiatorType = 'Driver';
  //             callTypeLabel = 'Safe Home';
  //             break;
  //         }

  //         return {
  //           ...data,
  //           driverName: this.notApplicable(data?.trip?.driver?.name),
  //           employeeId: this.notApplicable(data?.employee?.id),
  //           employeeName: this.notApplicable(data?.employee?.name),
  //           employeeCode: this.notApplicable(data?.employee?.employeeCode),
  //           tripId: this.notApplicable(data?.trip?.id),
  //           shiftTime: this.notApplicable(data?.trip?.shiftTime),
  //           pickDrop: this.notApplicable(data?.trip?.pickDrop),

  //           initiatorNumber: this.notApplicable(initiatorNumber),
  //           receiverNumber: this.notApplicable(receiverNumber),
  //           initiatorType: this.notApplicable(initiatorType),
  //           callTypeLabel: this.notApplicable(callTypeLabel),
  //           formattedCallDuration: this.notApplicable(
  //             data.callDuration ? formatDuration(data?.callDuration) : null,
  //           ),
  //           formattedCallCost: this.notApplicable(
  //             data.callCost != null
  //               ? `₹${Number(data?.callCost).toFixed(2)}`
  //               : null,
  //           ),
  //           recordingUrl: this.notApplicable(data?.recordingUrl),
  //           formattedDate: this.notApplicable(
  //             data.createdAt
  //               ? moment(data?.createdAt).format('Do MMMM YYYY, HH:mm')
  //               : null,
  //           ),
  //           callCount: this.notApplicable(data?.callCount),
  //           employeeTeam: this.notApplicable(data?.employee?.team?.name),
  //           employeeProcess: this.notApplicable(data?.employee?.process?.name),
  //           employeeCostCenter: this.notApplicable(
  //             data?.employee?.costcenter?.name,
  //           ),
  //         };
  //       });
  //       return {
  //         totalItems: totalItems,
  //         items: formattedItems,
  //       };
  //     } catch (error: any) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //       throw new InternalServerErrorException(error);
  //     }
  //   }

  private notApplicable(value: any) {
    return value === null || value === undefined || value === ''
      ? 'N/A'
      : value;
  }

  private maskSensitiveCodes(message = ''): string {
    if (!message) {
      return '';
    }
    return message
      ?.replace(
        // Password reset code
        /(password\s+reset\s+code\s+is\s+)(\d{4,8})/gi,
        '$1****',
      )
      ?.replace(
        // OTP patterns
        /(otp(?:\s+for\s+login\s+to\s+the\s+cordon\s+platform)?\s+is\s+)(\d{4,8})/gi,
        '$1****',
      )
      ?.replace(
        // OTP: 1234
        /(otp\s*:?\s*)(\d{4,8})/gi,
        '$1****',
      );
  }
}
