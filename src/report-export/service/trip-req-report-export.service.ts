import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { Op } from 'sequelize';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { Employee } from 'src/employee/models/employee.model';
import { SortOrder, Status } from 'src/shared/enums';
import { Team } from 'src/team/models/team.model';
import { Process } from 'src/process/models/process.model';
import { Location } from 'src/location-management/locations/models/location.model';
import * as moment from 'moment';
import { Driver } from 'src/drivers/models/driver.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Cab } from 'src/cabs/models/cab.model';
import { Costcenter } from 'src/costcenter/model/costcenter.model';
// PARKED: TR Report Requests/Latest — needs (orgID,date) index.
// import { TripRequestGroupService } from 'src/reports/services/trip-request-group.service';

@Injectable()
export class TripRequestReportExportService {
  private logger = new Logger(TripRequestReportExportService.name);

  constructor(
    @InjectModel(TripRequest)
    private tripRequestModel: typeof TripRequest, // PARKED: TR Report Requests/Latest — needs (orgID,date) index. // private tripRequestGroupService: TripRequestGroupService,
  ) {}

  async getNoshowReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<TripRequest>> {
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

      if (loginTimes?.length) {
        whereCondition.shiftTime = {
          [Op.in]: loginTimes,
        };
      }
      const trips = await this.tripRequestModel.findAndCountAll({
        // where: {
        //   noShow: true,
        //   ...whereCondition,
        // },
        where: {
          [Op.or]: [{ noShow: true }, { status: Status.EmployeeSelfNoShow }],
          ...whereCondition,
        },
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'tripID',
          'noShow',
          'status',
          'attendanceTime',
          'attendanceLocation',
        ],
        include: [
          {
            model: Trip,
            as: 'trip',
            required: true,
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
                model: Vendor,
                as: 'vendor',
                attributes: ['id', 'code', 'name'],
              },
              {
                model: Cab,
                as: 'cab',
                attributes: ['id', 'regNo'],
              },
            ],
          },
          {
            model: Employee,
            as: 'employee',
            attributes: [
              'id',
              'employeeCode',
              'name',
              'gender',
              'designation',
              'reportingID',
            ],
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
              {
                model: Costcenter,
                as: 'costcenter',
                attributes: ['id', 'name'],
              },
            ],
          },
        ],
      });

      // clear human readable label per row for employee-cancelled trip requests
      const items = trips.rows.map((row: any) => {
        const data = row.toJSON();
        return {
          ...data,
          attendanceTime: data.attendanceTime?.includes(' ')
            ? data.attendanceTime.split(' ')[1]
            : data.attendanceTime,
          reportReason:
            data.status === Status.EmployeeSelfNoShow
              ? 'Employee Self No Show'
              : 'No Show',
        };
      });

      return {
        totalItems: trips.count,
        items,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getEmployeeNoshowReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<TripRequest>> {
    try {
      const { employeeCode, sortBy, sortOrder } = reportFilterInput;

      const whereCondition: any = {};

      whereCondition.orgID = user.orgID;

      if (employeeCode) {
        whereCondition.employeeCode = {
          [Op.eq]: employeeCode.label,
        };
      }
      const trips = await this.tripRequestModel.findAndCountAll({
        // where: {
        //   noShow: true,
        //   ...whereCondition,
        // },
        where: {
          [Op.or]: [{ noShow: true }, { status: Status.EmployeeSelfNoShow }],
          ...whereCondition,
        },
        order: [[sortBy, sortOrder]],
        // limit: take,
        // offset: skip * take,
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'tripID',
          'noShow',
          'status',
          'attendanceTime',
          'attendanceLocation',
        ],
        include: [
          {
            model: Trip,
            as: 'trip',
            required: true,
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
                model: Vendor,
                as: 'vendor',
                attributes: ['id', 'code', 'name'],
              },
              {
                model: Cab,
                as: 'cab',
                attributes: ['id', 'regNo'],
              },
            ],
          },
          {
            model: Employee,
            as: 'employee',
            attributes: [
              'id',
              'employeeCode',
              'name',
              'gender',
              'designation',
              'reportingID',
            ],
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
              {
                model: Costcenter,
                as: 'costcenter',
                attributes: ['id', 'name'],
              },
            ],
          },
        ],
      });

      // clear human readable label per row for employee-cancelled trip requests
      const items = trips.rows.map((row: any) => {
        const data = row.toJSON();
        return {
          ...data,
          attendanceTime: data.attendanceTime?.includes(' ')
            ? data.attendanceTime.split(' ')[1]
            : data.attendanceTime,
          reportReason:
            data.status === Status.EmployeeSelfNoShow
              ? 'Employee Self No Show'
              : 'No Show',
        };
      });

      return {
        totalItems: trips.count,
        items,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllReports(
    exportFilters: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const {
        startDate,
        endDate,
        shiftTimes,
        status,
        pickDrop,
        attendance,
        noShow,
        // PARKED: TR Report Requests/Latest — needs (orgID,date) index.
        // latestOnly,
        search,
        sortBy = 'date',
        sortOrder = SortOrder.DESC,
      } = exportFilters.exportFilters;

      // If no dates provided, use current month (1st to today)
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

        this.logger.log(
          `No dates provided, using current month: ${finalStartDate} to ${finalEndDate}`,
        );
      }

      this.logger.log(
        `Finding trip requests between ${finalStartDate} and ${finalEndDate}`,
      );
      // Initialize the where clause
      let whereClause: any = {
        date: {
          [Op.between]: [finalStartDate, finalEndDate],
        },
      };

      // Add organization filter if user has an organization ID
      if (user && user.orgID) {
        whereClause.orgID = user.orgID;
        this.logger.debug(`Filtering by organization ID: ${user.orgID}`);
      }

      // Add search functionality
      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            {
              employeeCode: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              locationName: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              attendanceLocation: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }

      // Add status filter if provided, ensuring we use the correct enum values
      if (status && status.length > 0) {
        const validStatuses = status.filter((s) =>
          Object.values(Status).includes(s as Status),
        );

        if (validStatuses.length > 0) {
          whereClause.status = {
            [Op.in]: validStatuses,
          };
        }
      }

      // Add shift times filter if provided
      if (shiftTimes && shiftTimes.length > 0) {
        whereClause.shiftTime = {
          [Op.in]: shiftTimes,
        };
      }

      if (pickDrop !== null && pickDrop !== undefined) {
        whereClause.pickDrop = pickDrop;
      }

      // Add attendance filter if provided
      if (attendance !== undefined) {
        whereClause.attendance = attendance;
      }

      // Add no-show filter if provided
      if (noShow !== undefined) {
        whereClause.noShow = noShow;
      }

      // PARKED: TR Report Requests/Latest — needs (orgID,date) index.
      // // Same slot collapse as the grid. The export must read latestOnly itself - the FE
      // // spreads it into exportFilters, but nothing else would apply it, so the Excel
      // // would silently ignore the toggle and export every row. Unlike the grid this path
      // // has no limit/offset, so the pre-filter only makes the query smaller.
      // if (latestOnly === true) {
      //   const latestIDs = await this.tripRequestGroupService.getLatestIDs(
      //     { startDate: finalStartDate, endDate: finalEndDate },
      //     user,
      //   );
      //   if (latestIDs && latestIDs.length > 0) {
      //     whereClause.id = { [Op.in]: latestIDs };
      //   } else if (latestIDs && latestIDs.length === 0) {
      //     whereClause.id = { [Op.in]: [-1] };
      //   }
      //   // latestIDs === null -> helper failed -> skip the filter rather than export nothing.
      // }

      this.logger.debug(`Query where clause: ${JSON.stringify(whereClause)}`);
      const tripRequests = await this.tripRequestModel.findAndCountAll({
        where: whereClause,
        // limit: take,
        // offset: offset,
        order: [[sortBy, sortOrder]],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: [
              'id',
              'name',
              'employeeCode',
              'email',
              'phone',
              'address',
              'landmark',
              'homePoint',
              'gender',
            ],
          },
          {
            model: Team,
            as: 'team',
            attributes: ['id', 'name'],
          },
          {
            model: Process,
            as: 'process',
            attributes: ['id', 'name'],
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'id',
              'routeNumber',
              'vendorCode',
              'seats',
              'status',
              'shiftTime',
              'pickDrop',
            ],
          },
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name', 'geoCode'],
          },
        ],
      });
      // PARKED: TR Report Requests/Latest — needs (orgID,date) index.
      // // Slot grouping runs before the map so requestCount/isLatest can be spread in
      // // alongside the other flattened fields. The tuple list is chunked inside the
      // // helper, which matters here: this method's limit/offset are commented out above,
      // // so it loads the whole matching set rather than a page.
      // const slotGroups = await this.tripRequestGroupService.getSlotGroups(
      //   tripRequests.rows,
      //   user,
      // );

      const formattedItems = tripRequests.rows.map((trip: any) => ({
        id: trip.id,
        date: trip.date,
        status: trip.status,
        shiftTime: trip.shiftTime,
        pickDrop: trip.pickDrop ? 'Pick' : 'Drop',
        noShow: trip.noShow,
        createdAt: trip.createdAt ?? null,
        updatedAt: trip.updatedAt ?? null,
        // PARKED: TR Report Requests/Latest — needs (orgID,date) index.
        // ...this.tripRequestGroupService.decorate(trip, slotGroups),

        // Flatten employee
        employeeName: trip.employee?.name ?? '',
        employeeCode: trip.employee?.employeeCode ?? '',
        employeeEmail: trip.employee?.email ?? '',
        employeePhone: trip.employee?.phone ?? '',
        employeeAddress: trip.employee?.address ?? '',
        employeeLandmark: trip.employee?.landmark ?? '',
        employeeHomePoint: trip.employee?.homePoint ?? '',
        employeeGender: trip.employee?.gender ?? '',

        // Flatten team
        team: trip?.team?.name ?? '',

        // Flatten process
        process: trip?.process?.name ?? '',

        // Flatten trip
        tripRouteNumber: trip.trip?.routeNumber ?? '',
        tripVendorCode: trip.trip?.vendorCode ?? '',
        tripSeats: trip.trip?.seats ?? '',
        tripShiftTime: trip.trip?.shiftTime ?? '',
        tripStatus: trip.trip?.status ?? '',
        tripPickDrop: trip.trip?.pickDrop ?? '',

        // Flatten location
        locationName: trip.location?.name ?? '',
        locationGeoCode: trip.location?.geoCode ?? '',
      }));
      this.logger.log(
        `Found ${tripRequests.count} trip requests matching the criteria`,
      );
      return {
        totalItems: tripRequests.count,
        items: formattedItems,
        entityPermissions: user?.permissions?.filter(
          (permission) => permission?.split('-')?.[0] === 'Report',
        ),
      };
    } catch (error) {
      this.logger.error(
        `Error fetching trip request reports: ${error.message}`,
        error.stack,
      );
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error fetching trip request reports',
      );
    }
  }

  async findAllCancelledReports(
    // filterDto: CancelledTripRequestFilterDto,
    exportFilters: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const {
        dateRange,
        loginTimes,
        logoutTimes,
        sortBy = 'date',
        sortOrder = SortOrder.DESC,
      } = exportFilters?.exportFilters;
      const whereClause: any = {};
      whereClause.orgID = user.orgID;
      whereClause.status = Status.Cancelled;
      if (dateRange) {
        whereClause.date = {
          [Op.between]: [dateRange.startDate, dateRange.endDate],
        };
      }

      // Add login times filter if provided (for pickup trips)
      if (loginTimes && loginTimes.length > 0) {
        const loginCondition = {
          pickDrop: true, // pickup trips
          shiftTime: {
            [Op.in]: loginTimes,
          },
        };

        if (!whereClause[Op.and]) {
          whereClause[Op.and] = [];
        }
        whereClause[Op.and].push(loginCondition);
      }

      // Add logout times filter if provided (for drop trips)
      if (logoutTimes && logoutTimes.length > 0) {
        const logoutCondition = {
          pickDrop: false, // drop trips
          shiftTime: {
            [Op.in]: logoutTimes,
          },
        };

        if (loginTimes && loginTimes.length > 0) {
          // Create an OR condition between login and logout
          whereClause[Op.or] = [
            { [Op.and]: [whereClause[Op.and][0]] },
            logoutCondition,
          ];
          delete whereClause[Op.and];
        } else {
          if (!whereClause[Op.or]) {
            whereClause[Op.or] = [];
          }
          whereClause[Op.or].push(logoutCondition);
        }
      }

      const tripRequests = await this.tripRequestModel.findAndCountAll({
        where: whereClause,
        // limit: take,
        // offset: offset,
        order: [[sortBy, sortOrder]],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: [
              'id',
              'name',
              'employeeCode',
              'email',
              'phone',
              'address',
              'landmark',
              'homePoint',
            ],
          },
          {
            model: Team,
            as: 'team',
            attributes: ['id', 'name'],
          },
          {
            model: Process,
            as: 'process',
            attributes: ['id', 'name'],
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'id',
              'routeNumber',
              'vendorCode',
              'seats',
              'status',
              'shiftTime',
              'pickDrop',
            ],
          },
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name', 'geoCode'],
          },
        ],
      });
      const formattedItems = tripRequests.rows.map((trip: any) => ({
        id: trip.id,
        employeeCode: trip.employeeCode,
        date: trip.date ? moment(trip.date).format('DD-MM-YYYY') : '-',
        shiftTime: trip.shiftTime,
        pickDrop: trip.pickDrop ? 'Pick' : 'Drop',
        status: trip.status,
        emergencyType: trip.emergencyType,
        pickUpTime: trip.pickUpTime,
        dropTime: trip.dropTime,
        attendance: trip.attendance,
        noShow: trip.noShow,
        locationName: trip.locationName,
        employeeName: trip.employee.name,
        employeeEmail: trip.employee.email,
        employeePhone: trip.employee.phone,
        employeeAddress: trip.employee.address,
        employeeLandmark: trip.employee.landmark,
        employeeHomePoint: trip.employee.homePoint,
        team: trip.team,
        process: trip.proces,
      }));

      return {
        totalItems: tripRequests.count,
        items: formattedItems,
        entityPermissions: user?.permissions?.filter(
          (permission) => permission?.split('-')?.[0] === 'Report',
        ),
      };
    } catch (error) {
      this.logger.error(
        `Error fetching cancelled trip request reports: ${error.message}`,
        error.stack,
      );
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error fetching cancelled trip request reports',
      );
    }
  }
  async findAllAdHocMedicalReports(
    // filterDto: TripRequestAdHocMedicalFilterDto,
    exportFilters: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const {
        dateRange,
        loginTimes,
        logoutTimes,
        emergencyTypes,
        sortBy = 'date',
        sortOrder = SortOrder.DESC,
      } = exportFilters?.exportFilters;

      //   const { dateRange, loginTimes, logoutTimes, emergencyTypes } = filters;

      //   this.logger.log(
      //     `Finding AdHoc/Medical trip requests between ${startDate} and ${endDate}`,
      //   );

      // Initialize the where clause
      const whereClause: any = {};
      whereClause.orgID = user.orgID;
      if (dateRange) {
        whereClause.date = {
          [Op.between]: [dateRange.startDate, dateRange.endDate],
        };
      }
      whereClause.emergencyType = {
        [Op.in]: ['AdHoc', 'Medical'],
      };

      //     date: {
      //       [Op.between]: [startDate, endDate],
      //     },
      //     // Filter only AdHoc and Medical emergency types
      //     emergencyType: {
      //       [Op.in]: ['AdHoc', 'Medical'],
      //     },
      //   };

      // Add organization filter if user has an organization ID
      //   if (user && user.orgID) {
      //     whereClause.orgID = user.orgID;
      //     this.logger.debug(`Filtering by organization ID: ${user.orgID}`);
      //   }

      // Add search functionality
      //   if (search) {
      //     whereClause = {
      //       ...whereClause,
      //       [Op.or]: [
      //         {
      //           employeeCode: {
      //             [Op.iLike]: `%${search}%`,
      //           },
      //         },
      //         {
      //           locationName: {
      //             [Op.iLike]: `%${search}%`,
      //           },
      //         },
      //         {
      //           attendanceLocation: {
      //             [Op.iLike]: `%${search}%`,
      //           },
      //         },
      //       ],
      //     };
      //   }
      //   console.log('emergencyTypes--', emergencyTypes);
      // Add emergency type filter if provided
      if (emergencyTypes && emergencyTypes.length > 0) {
        // Only allow AdHoc and Medical types
        const validEmergencyTypes = emergencyTypes.filter((type) =>
          ['AdHoc', 'Medical'].includes(type),
        );

        if (validEmergencyTypes.length > 0) {
          whereClause.emergencyType = {
            [Op.in]: validEmergencyTypes,
          };
        }
      }

      // Add login times filter if provided (for pickup trips)
      if (loginTimes && loginTimes.length > 0) {
        const loginCondition = {
          pickDrop: true, // pickup trips
          shiftTime: {
            [Op.in]: loginTimes,
          },
        };

        if (!whereClause[Op.and]) {
          whereClause[Op.and] = [];
        }
        whereClause[Op.and].push(loginCondition);
      }

      // Add logout times filter if provided (for drop trips)
      if (logoutTimes && logoutTimes.length > 0) {
        const logoutCondition = {
          pickDrop: false, // drop trips
          shiftTime: {
            [Op.in]: logoutTimes,
          },
        };

        if (loginTimes && loginTimes.length > 0) {
          // Create an OR condition between login and logout
          whereClause[Op.or] = [
            { [Op.and]: [whereClause[Op.and][0]] },
            logoutCondition,
          ];
          delete whereClause[Op.and];
        } else {
          if (!whereClause[Op.or]) {
            whereClause[Op.or] = [];
          }
          whereClause[Op.or].push(logoutCondition);
        }
      }

      this.logger.debug(`Query where clause: ${JSON.stringify(whereClause)}`);

      //   // Compute proper offset based on skip and take
      //   const offset = skip * take;

      const tripRequests = await this.tripRequestModel.findAndCountAll({
        where: whereClause,
        order: [[sortBy, sortOrder]],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: [
              'id',
              'name',
              'employeeCode',
              'email',
              'phone',
              'address',
              'landmark',
              'homePoint',
            ],
          },
          {
            model: Team,
            as: 'team',
            attributes: ['id', 'name'],
          },
          {
            model: Process,
            as: 'process',
            attributes: ['id', 'name'],
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'id',
              'routeNumber',
              'vendorCode',
              'seats',
              'status',
              'shiftTime',
              'pickDrop',
            ],
          },
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name', 'geoCode'],
          },
        ],
      });

      this.logger.log(
        `Found ${tripRequests.count} AdHoc/Medical trip requests matching the criteria`,
      );

      const formattedItems = tripRequests.rows.map((trip: any) => ({
        id: trip.id,
        employeeCode: trip.employeeCode,
        date: trip.date ? moment(trip.date).format('DD-MM-YYYY') : '-',
        shiftTime: trip.shiftTime,
        pickDrop: trip.pickDrop ? 'Pick' : 'Drop',
        status: trip.status,
        emergencyType: trip.emergencyType,
        pickUpTime: trip.pickUpTime,
        dropTime: trip.dropTime,
        attendance: trip.attendance,
        noShow: trip.noShow,
        locationName: trip.locationName,
        employeeName: trip.employee.name,
        employeeEmail: trip.employee.email,
        employeePhone: trip.employee.phone,
        employeeAddress: trip.employee.address,
        employeeLandmark: trip.employee.landmark,
        employeeHomePoint: trip.employee.homePoint,
        team: trip.team,
        process: trip.proces,
      }));

      return {
        totalItems: tripRequests.count,
        items: formattedItems,
        entityPermissions: user?.permissions?.filter(
          (permission) => permission?.split('-')?.[0] === 'Report',
        ),
      };
    } catch (error: any) {
      this.logger.error(
        `Error fetching AdHoc/Medical trip request reports: ${error.message}`,
        error.stack,
      );
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error fetching AdHoc/Medical trip request reports',
      );
    }
  }

  async getTripRatingReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const {
        sortBy = 'updatedAt',
        sortOrder = 'DESC',
        // filters = {}
      } = reportFilterInput;
      const filters = reportFilterInput.exportFilters || {};
      const { dateRange, employee, pickDrop } = filters || {};
      const where: any = {
        orgID: user.orgID,
      };
      const empName = employee?.label;
      const empCode = employee?.code;
      // if (employeeCode?.label) {
      //   where.employeeCode = {
      //     [Op.eq]: employeeCode.label,
      //   };
      // }
      if (dateRange) {
        where.date = { [Op.between]: [dateRange.startDate, dateRange.endDate] };
      }

      if (pickDrop) {
        where.pickDrop = pickDrop == 'Pick' ? true : false;
      }
      where.ratings = { [Op.gt]: 0 };

      const trips = await this.tripRequestModel.findAndCountAll({
        where,
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'tripID',
          'ratings',
          'comments',
          'date',
          'shiftTime',
          'pickDrop',
        ],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['name', 'gender', 'designation'],
            // where: empName
            //   ? {
            //       name: {
            //         [Op.like]: `%${empName}%`,
            //       },
            //     }
            //   : undefined,
            where: employee
              ? {
                  [Op.or]: [
                    {
                      name: { [Op.iLike]: `%${empName.split('(')[0].trim()}%` },
                    },
                    { employeeCode: { [Op.iLike]: `%${empCode}%` } },
                    {
                      [Op.and]: [
                        {
                          name: {
                            [Op.iLike]: `%${empName.split('(')[0].trim()}%`,
                          },
                        },
                        { employeeCode: { [Op.iLike]: `%${empCode}%` } },
                      ],
                    },
                  ],
                }
              : undefined,
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'routeNumber',
              'seats',
              'status',
              'date',
              'pickDrop',
              'driverID',
              'vendorCode',
            ],
            include: [
              {
                model: Driver,
                as: 'driver',
                attributes: ['id', 'name'],
              },
            ],
          },
        ],
        order: [[sortBy, sortOrder]],
      });

      return {
        totalItems: trips.count,
        items: trips.rows,
      };
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async getCabArrivalTimeReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const {
        sortBy = 'id',
        sortOrder = 'DESC',
        filters = {},
      } = reportFilterInput;

      const { dateRange, employee, pickDrop } = filters || {};

      const where: any = {
        orgID: user.orgID,
        markCabReached: true,
      };
      const empName = employee?.label;
      const empCode = employee?.code;

      if (dateRange) {
        where.date = { [Op.between]: [dateRange.startDate, dateRange.endDate] };
      }

      if (pickDrop) {
        where.pickDrop = pickDrop == 'Pick' ? true : false;
      }
      const trips = await this.tripRequestModel.findAndCountAll({
        where,
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'tripID',
          'date',
          'shiftTime',
          'pickDrop',
          'pickUpTime',
          'dropTime',
          'cabArrivedAt',
          'attendanceTime',
          'cabWaitingTime',
        ],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['name', 'gender', 'designation'],
            where: employee
              ? {
                  [Op.or]: [
                    {
                      name: { [Op.iLike]: `%${empName.split('(')[0].trim()}%` },
                    },
                    { employeeCode: { [Op.iLike]: `%${empCode}%` } },
                    {
                      [Op.and]: [
                        {
                          name: {
                            [Op.iLike]: `%${empName.split('(')[0].trim()}%`,
                          },
                        },
                        { employeeCode: { [Op.iLike]: `%${empCode}%` } },
                      ],
                    },
                  ],
                }
              : undefined,
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'routeNumber',
              'seats',
              'status',
              'date',
              'pickDrop',
              'driverID',
              'vendorCode',
            ],
            where: {
              status: {
                [Op.in]: ['Ongoing', 'Completed'],
              },
            },
            required: true,
            include: [
              {
                model: Driver,
                as: 'driver',
                attributes: ['id', 'name'],
              },
            ],
          },
        ],
        order: [[sortBy, sortOrder]],
      });
      const items = trips.rows.map((row: any) => {
        const data = row.toJSON();

        let driverDelay: number | null = null;
        let employeeDelay: number | null = null;
        const datePart = moment(data.date).format('YYYY-MM-DD');

        //Pick or Drop
        const scheduledTime = data.pickDrop ? data.pickUpTime : data.dropTime;

        if (scheduledTime) {
          const scheduledDateTime = moment(
            `${datePart} ${scheduledTime}`,
            'YYYY-MM-DD HH:mm',
          );
          if (data.cabArrivedAt) {
            const cabTime = moment.parseZone(data.cabArrivedAt);

            // Driver delay
            driverDelay = cabTime.diff(scheduledDateTime, 'minutes');
          }
          if (data.attendanceTime) {
            const attendanceTime = moment(
              data.attendanceTime,
              'YYYY-MM-DD HH:mm:ss',
            );
            const cabWaitingTime = moment.parseZone(data.cabWaitingTime);

            // Employee delay
            employeeDelay = attendanceTime.diff(cabWaitingTime, 'minutes');
          }
        }
        return {
          ...data,
          driverDelay,
          employeeDelay,
          driverStatus: this.formatDelay(driverDelay, 'driver'),
          employeeStatus: this.formatDelay(employeeDelay, 'employee'),
        };
      });

      return {
        totalItems: trips.count,
        items: items,
      };
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  private formatDelay(
    delay: number | null,
    type: 'driver' | 'employee',
  ): string | null {
    if (delay === null || isNaN(delay)) return '';

    if (delay === 0) {
      return type === 'driver'
        ? 'Driver reached on time'
        : 'Employee boarded on time';
    }

    if (delay < 0) {
      return type === 'driver'
        ? `Driver arrived ${Math.abs(delay)} minutes early`
        : `Employee boarded ${Math.abs(delay)} minutes early`;
    }

    return type === 'driver'
      ? `Driver is late by ${delay} minutes`
      : `Employee is late by ${delay} minutes`;
  }
}
