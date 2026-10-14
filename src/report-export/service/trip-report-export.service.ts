import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { Op, Sequelize } from 'sequelize';
import { TripActual } from 'src/trip-management/trip/models/trip-actual.model';
import { Cab } from 'src/cabs/models/cab.model';
import { Driver } from 'src/drivers/models/driver.model';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { Security } from 'src/security/models/security.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import * as moment from 'moment';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { EmergencyType, SortOrder, Status } from 'src/shared/enums';
import { Organization } from 'src/organization/models/organization.model';

@Injectable()
export class TripReportExportService {
  private logger = new Logger(TripReportExportService.name);

  constructor(
    @InjectModel(Trip)
    private tripModel: typeof Trip,
  ) {}

  async getOTAReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const filters = reportFilterInput;
      const { dateRange, loginTimes } = filters;

      const whereCondition: any = {};

      whereCondition.orgID = user.orgID;

      if (dateRange) {
        whereCondition.date = {
          [Op.between]: [
            new Date(dateRange.startDate),
            new Date(dateRange.endDate),
          ],
        };
      }
      whereCondition.pickDrop = 'Pick';

      if (loginTimes?.length) {
        whereCondition.shiftTime = {
          [Op.in]: loginTimes,
        };
      }

      const trips = await this.tripModel.findAndCountAll({
        where: whereCondition,
        attributes: {
          include: [
            // Extract first employee's cabArrivalAt
            [
              Sequelize.literal(`"Trip"."employees"->0->>'cabArrivalTime'`),
              'firstEmpCabArrivalTime',
            ],
            // Extract first employee's attendanceTime
            [
              Sequelize.literal(`"Trip"."employees"->0->>'attendanceTime'`),
              'firstEmpAttendanceTime',
            ],
            [
              Sequelize.literal(`( SELECT tr."emergencyType" FROM "TripRequests" tr
             WHERE tr."tripID" = "Trip"."id" ORDER BY tr."createdAt" DESC LIMIT 1
             )`),
              'emergencyType',
            ],
            [
              Sequelize.literal(`( SELECT tr."cabArrivedAt" FROM "TripRequests" tr
            WHERE tr."tripID" = "Trip"."id" AND tr."employeeID" = ("Trip"."employees"->0->>'employeeID')::bigint LIMIT 1
            )`),
              'firstEmpCabArrivedAt',
            ],
          ],
        },
        include: [
          {
            model: Cab,
            as: 'cab',
          },
          {
            model: Driver,
            as: 'driver',
          },
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name'],
          },
          // {
          //   model: TripActual,
          //   as: 'tripActual',
          //   where: Sequelize.literal(
          //     `CAST("tripActual"."actualEndTime" AS TIME) <= CAST("Trip"."shiftTime" AS TIME)`,
          //   ),
          // },
          {
            model: TripActual,
            as: 'tripActual',
            where: Sequelize.literal(`
            CAST("tripActual"."actualEndTime" As TIME) <= CAST("Trip"."estimatedEndDateTime" AT TIME ZONE 'Asia/Kolkata' As TIME)
            `),
          },
        ],
      });
      return {
        totalItems: trips.count,
        items: trips.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getOTDReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const filters = reportFilterInput;
      const { dateRange, logoutTimes } = filters;

      const whereCondition: any = {};

      whereCondition.orgID = user.orgID;

      if (dateRange) {
        whereCondition.date = {
          [Op.between]: [
            new Date(dateRange.startDate),
            new Date(dateRange.endDate),
          ],
        };
      }

      whereCondition.pickDrop = 'Drop';
      if (logoutTimes?.length) {
        whereCondition.shiftTime = {
          [Op.in]: logoutTimes,
        };
      }

      const trips = await this.tripModel.findAndCountAll({
        where: whereCondition,
        attributes: {
          include: [
            // Extract first employee's cabArrivalAt
            [
              Sequelize.literal(`"Trip"."employees"->0->>'cabArrivalTime'`),
              'firstEmpCabArrivalTime',
            ],
            // Extract first employee's attendanceTime
            [
              Sequelize.literal(`"Trip"."employees"->0->>'attendanceTime'`),
              'firstEmpAttendanceTime',
            ],
            [
              Sequelize.literal(`( SELECT tr."emergencyType" FROM "TripRequests" tr
             WHERE tr."tripID" = "Trip"."id" ORDER BY tr."createdAt" DESC LIMIT 1
             )`),
              'emergencyType',
            ],
            [
              Sequelize.literal(`( SELECT tr."cabArrivedAt" FROM "TripRequests" tr
            WHERE tr."tripID" = "Trip"."id" AND tr."employeeID" = ("Trip"."employees"->0->>'employeeID')::bigint LIMIT 1
            )`),
              'firstEmpCabArrivedAt',
            ],
          ],
        },
        include: [
          {
            model: Cab,
            as: 'cab',
          },
          {
            model: Driver,
            as: 'driver',
          },
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name'],
          },
          {
            model: TripActual,
            as: 'tripActual',
            // where: Sequelize.literal(
            //   `CAST("tripActual"."actualStartTime" AS TIME) >= CAST("Trip"."shiftTime" AS TIME)`,
            // ),
            where: Sequelize.literal(`
            CAST("tripActual"."actualStartTime" As TIME) >= CAST("Trip"."estimatedStartDateTime" AT TIME ZONE 'Asia/Kolkata' As TIME)
            `),
          },
        ],
      });
      return {
        totalItems: trips.count,
        items: trips.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getEscortReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const filters = reportFilterInput;
      const { dateRange, escort } = filters;

      const whereCondition: any = {};

      whereCondition.orgID = user.orgID;

      if (dateRange) {
        whereCondition.date = {
          [Op.between]: [
            new Date(dateRange.startDate),
            new Date(dateRange.endDate),
          ],
        };
      }

      if (escort) {
        const labelArray = escort.map((item) => item.label);
        whereCondition.spockCode = {
          [Op.in]: labelArray,
        };
      }

      //   const offset = skip * take;
      const trips = await this.tripModel.findAndCountAll({
        where: {
          ...whereCondition,
          spock: true,
          spockID: { [Op.ne]: null },
        },
        // limit: take,
        // offset: offset,
        // order: [[sortBy, sortOrder]],
        attributes: [
          'id',
          'routeNumber',
          'seats',
          'pickDrop',
          'tripLocation',
          'status',
          'date',
          'shiftTime',
          'lockStatus',
        ],
        include: [
          {
            model: Security,
            as: 'security',
            attributes: [
              'id',
              'name',
              'gender',
              'address',
              'phone1',
              'securityCode',
            ],
          },
        ],
      });
      return {
        totalItems: trips.count,
        items: trips.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllReportsExportDetailedVendor(
    filterDto: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const {
        startDate,
        endDate,
        loginTimes,
        logoutTimes,
        status,
        search,
        sortBy = 'date',
        sortOrder = SortOrder.DESC,
      } = filterDto;

      this.logger.log(
        `Finding detailed vendor trips (export) between ${startDate} and ${endDate}`,
      );

      let finalStartDate = startDate;
      let finalEndDate = endDate;

      if (!startDate || !endDate) {
        const today = new Date();
        const firstDayOfMonth = new Date(
          today.getFullYear(),
          today.getMonth(),
          1,
        );
        finalStartDate = firstDayOfMonth.toISOString().split('T')[0];
        finalEndDate = today.toISOString().split('T')[0];
      }

      let whereClause: any = {
        date: {
          [Op.between]: [finalStartDate, finalEndDate],
        },
      };

      if (user && user.orgID) {
        whereClause.orgID = user.orgID;
      }

      // Vendor-scoping: hard-locked to the caller's own vendorID whenever
      // present. This endpoint is consumed by the vendor app, so a vendor
      // must only ever see trips assigned to them - not filtered by an
      // optional param they could widen, unlike getVendorTripDetails'
      // admin-facing vendorID fallback. Deliberately never read from
      // filterDto/exportFilters: neither destructure below pulls a vendorID
      // field, so nothing client-supplied can override or bypass this.
      if (user?.vendorID) {
        whereClause.vendorID = user.vendorID;
        this.logger.debug(`Filtering by vendor ID: ${user.vendorID}`);
      }

      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            { routeNumber: { [Op.iLike]: `%${search}%` } },
            { vendorCode: { [Op.iLike]: `%${search}%` } },
          ],
        };
      }

      if (status && status.length > 0) {
        whereClause.status = { [Op.in]: status };
      }

      if (loginTimes && loginTimes.length > 0) {
        const loginCondition = {
          pickDrop: 'Pick',
          shiftTime: { [Op.in]: loginTimes },
        };
        if (!whereClause[Op.and]) {
          whereClause[Op.and] = [];
        }
        whereClause[Op.and].push(loginCondition);
      }

      if (logoutTimes && logoutTimes.length > 0) {
        const logoutCondition = {
          pickDrop: 'Drop',
          shiftTime: { [Op.in]: logoutTimes },
        };
        if (loginTimes && loginTimes.length > 0) {
          whereClause[Op.or] = [
            { [Op.and]: [whereClause[Op.and][0]] },
            logoutCondition,
          ];
          delete whereClause[Op.and];
        } else {
          whereClause[Op.or] = [logoutCondition];
        }
      }

      // this.logger.debug(`Query where clause: ${JSON.stringify(whereClause)}`);

      const trips = await this.tripModel.findAndCountAll({
        where: whereClause,
        order: [[sortBy, sortOrder]],
        distinct: true,
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name', 'code'],
            required: false,
          },
          {
            model: Cab,
            as: 'cab',
            attributes: [
              'id',
              'regNo',
              'noOfSeats',
              'color',
              'fuelType',
              'model',
            ],
            required: false,
          },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'phone', 'licenseNo', 'licenseExpiry'],
            required: false,
          },
          {
            model: Security,
            as: 'security',
            attributes: ['id', 'name', 'phone1', 'securityCode'],
            required: false,
          },
          {
            model: TripActual,
            as: 'tripActual',
            attributes: [
              'id',
              'actualStartDate',
              'actualStartTime',
              'actualEndDate',
              'actualEndTime',
              'actualDistance',
              'actualCost',
              'actualCostOverride',
              'isCostOverridden',
              'billingRate',
              'remarks',
            ],
            required: false,
          },
          {
            model: TripRequest,
            as: 'employeeTripRequest',
          },
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
      });

      this.logger.log(
        `Found ${trips.count} trips matching the criteria (export)`,
      );

      const items = trips.rows.map((trip: any) => {
        const cabModel = trip.cab?.model ?? null;
        const plannedCapacity = trip.estimatedOccupancy ?? null;
        const employeeIds = Array.isArray(trip.employees)
          ? trip.employees.map((emp: any) => emp.id)
          : [];
        const estStartTime = trip.estimatedStartDateTime ?? null;
        const estStopTime = trip.estimatedEndDateTime ?? null;
        const billingMode = trip.tripActual?.billingRate?.billingPlan ?? null;
        const cost = trip.tripActual?.isCostOverridden
          ? trip.tripActual?.actualCostOverride
          : trip.tripActual?.actualCost ?? null;
        const remarks = trip.tripActual?.remarks ?? null;

        const validEmergencyTypes = [
          EmergencyType.Emergency,
          EmergencyType.AdHoc,
          EmergencyType.Medical,
        ];
        const tripType = validEmergencyTypes.includes(trip.emergencyType)
          ? trip.emergencyType
          : 'Normal';

        let presentCount = 0;
        let noShowCount = 0;
        let selfNoShowCount = 0;
        const tripRequests: any[] = trip.employeeTripRequest ?? [];
        for (const req of tripRequests) {
          if (req.status === Status.EmployeeSelfNoShow) {
            selfNoShowCount++;
          } else if (req.attendance === true) {
            presentCount++;
          } else if (req.attendance === false) {
            noShowCount++;
          }
        }

        let driverDiffMinutes: number | null = null;
        let employeeDiffMinutes: number | null = null;
        const firstEmployee = trip.employees?.[0];

        if (trip.pickDrop === 'Pick') {
          if (trip.estimatedEndDateTime && trip.tripActual?.actualEndTime) {
            const estimated = moment(trip.estimatedEndDateTime);
            const actual = moment(
              `${moment(trip.estimatedEndDateTime).format('YYYY-MM-DD')} ${
                trip.tripActual.actualEndTime
              }`,
              'YYYY-MM-DD HH:mm:ss',
            );
            driverDiffMinutes = actual.diff(estimated, 'minutes');
          }

          const empRequest = tripRequests.find(
            (req: any) =>
              firstEmployee &&
              String(req.employeeID) === String(firstEmployee.id),
          );
          if (empRequest?.attendanceTime && empRequest?.cabWaitingTime) {
            const attendance = moment(empRequest.attendanceTime);
            const waiting = moment(empRequest.cabWaitingTime);
            employeeDiffMinutes = attendance.diff(waiting, 'minutes');
          }
        } else if (trip.pickDrop === 'Drop') {
          if (trip.estimatedStartDateTime && trip.tripActual?.actualStartTime) {
            const estimated = moment(trip.estimatedStartDateTime);
            const actual = moment(
              `${estimated.format('YYYY-MM-DD')} ${
                trip.tripActual.actualStartTime
              }`,
              'YYYY-MM-DD HH:mm:ss',
            );
            driverDiffMinutes = actual.diff(estimated, 'minutes');
          }

          const empRequest = tripRequests.find(
            (req: any) =>
              firstEmployee &&
              String(req.employeeID) === String(firstEmployee.id),
          );
          if (empRequest?.attendanceTime && trip.estimatedStartDateTime) {
            const attendance = moment(empRequest.attendanceTime);
            const estimatedTime = moment(trip.estimatedStartDateTime);
            employeeDiffMinutes = attendance.diff(estimatedTime, 'minutes');
          }
        }

        const formatDelay = (diff: number) =>
          diff <= 0 ? 'On Time' : `${diff} mins delay`;

        let delayIssue: string | null = null;
        let delayReason: string | null = null;
        const driverLate = driverDiffMinutes !== null && driverDiffMinutes > 0;
        const employeeLate =
          employeeDiffMinutes !== null && employeeDiffMinutes > 0;

        if (driverLate) {
          delayIssue = formatDelay(driverDiffMinutes as number);
          delayReason = 'Delay by Driver';
        } else if (employeeLate) {
          delayIssue = formatDelay(employeeDiffMinutes as number);
          delayReason = 'Delay by Employee';
        } else if (driverDiffMinutes !== null || employeeDiffMinutes !== null) {
          delayIssue = 'On Time';
          delayReason = '';
        }

        return {
          ...trip.toJSON(),
          cabModel,
          plannedCapacity,
          employeeIds,
          estStartTime,
          estStopTime,
          remarks,
          billingMode,
          cost,
          tripType,
          presentCount,
          noShowCount,
          selfNoShowCount,
          delayIssue,
          delayReason,
        };
      });

      return {
        totalItems: trips.count,
        items,
        entityPermissions: user?.permissions?.filter(
          (permission) => permission?.split('-')?.[0] === 'Report',
        ),
      };
    } catch (error: any) {
      this.logger.error(
        `Error fetching detailed vendor trip reports (export): ${error.message}`,
        error.stack,
      );
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error fetching detailed vendor trip reports',
      );
    }
  }
}
