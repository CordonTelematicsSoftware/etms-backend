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
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Security } from 'src/security/models/security.model';
import { TripReportFilterDto } from '../dto/trip-report-filter.dto';
import { EmergencyType, SortOrder, Status, TripStatus } from 'src/shared/enums';
import * as moment from 'moment';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { VendorTripReportFilterDto } from '../dto/vendor-trip-filter.dto';
import { Organization } from 'src/organization/models/organization.model';

@Injectable()
export class TripReportService {
  private logger = new Logger(TripReportService.name);

  constructor(
    @InjectModel(Trip)
    private tripModel: typeof Trip,
  ) {}

  async getOTAReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const { filters, skip, take, sortBy, sortOrder } = reportFilterInput;
      const { dateRange, loginTimes } = filters;

      const whereCondition: any = {};

      whereCondition.orgID = user.orgID;
      whereCondition.status = TripStatus.Completed;

      if (dateRange) {
        whereCondition.date = {
          [Op.between]: [dateRange.startDate, dateRange.endDate],
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
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        distinct: true,
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
            attributes: ['id', 'tripID', 'actualEndTime'],
          },
          {
            model: TripRequest,
            as: 'employeeTripRequest',
          },
        ],
      });
      const items = trips.rows.map((trip: any) => {
        const firstEmployee = trip.employees?.[0];
        const firstEmpCabArrivalTime = firstEmployee?.cabArrivalTime || null;
        let firstEmpCabArrivedAt = null;
        let firstEmpAttendanceTime = null;
        let firstEmpWaitingTime = null;
        let emergencyType = null;
        let boardingDelay = null;

        if (trip.employeeTripRequest?.length) {
          // latest emergency type for trip
          const latestRequest = trip.employeeTripRequest.reduce(
            (latest: any, current: any) => {
              return new Date(current.createdAt) > new Date(latest.createdAt)
                ? current
                : latest;
            },
          );
          emergencyType = latestRequest?.emergencyType;

          // find request for first employee
          const empRequest = trip.employeeTripRequest.find(
            (req: any) => String(req.employeeID) === String(firstEmployee.id),
          );
          firstEmpCabArrivedAt = empRequest?.cabArrivedAt || null;
          firstEmpAttendanceTime = empRequest?.attendanceTime || null;
          firstEmpWaitingTime = empRequest?.cabWaitingTime || null;

          if (empRequest?.attendanceTime && empRequest?.cabWaitingTime) {
            const attendance = moment(empRequest.attendanceTime);
            const waiting = moment(empRequest.cabWaitingTime);
            const diffMinutes = attendance.diff(waiting, 'minutes');

            if (diffMinutes <= 0) {
              boardingDelay = 'On Time';
            } else {
              boardingDelay = `${diffMinutes} mins delay`;
            }
          }
        }

        let delayStatus = null;
        if (trip.estimatedEndDateTime && trip.tripActual?.actualEndTime) {
          const estimated = moment(trip.estimatedEndDateTime);
          const actual = moment(
            `${moment(trip.estimatedEndDateTime).format('YYYY-MM-DD')} ${
              trip.tripActual.actualEndTime
            }`,
            'YYYY-MM-DD HH:mm:ss',
          );
          const diffMinutes = actual.diff(estimated, 'minutes');
          if (diffMinutes <= 0) {
            delayStatus = 'On Time';
          } else {
            delayStatus = `${diffMinutes} mins delay`;
          }
        }

        return {
          ...trip.toJSON(),
          emergencyType,
          firstEmpCabArrivedAt,
          firstEmpAttendanceTime,
          firstEmpCabArrivalTime,
          firstEmpWaitingTime,
          delayStatus,
          boardingDelay,
        };
      });
      return {
        totalItems: trips.count,
        items: items,
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
      const { filters, skip, take, sortBy, sortOrder } = reportFilterInput;
      const { dateRange, logoutTimes } = filters;

      const whereCondition: any = {};

      whereCondition.orgID = user.orgID;
      whereCondition.status = TripStatus.Completed;

      if (dateRange) {
        whereCondition.date = {
          [Op.between]: [
            // new Date(dateRange.startDate),
            // new Date(dateRange.endDate),
            dateRange.startDate,
            dateRange.endDate,
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
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        distinct: true,
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
            attributes: ['id', 'tripID', 'actualStartTime', 'actualEndTime'],
          },
          {
            model: TripRequest,
            as: 'employeeTripRequest',
          },
        ],
      });
      const items = trips.rows.map((trip: any) => {
        const firstEmployee = trip.employees?.[0];
        const firstEmpCabArrivalTime = firstEmployee?.cabArrivalTime || null;
        let firstEmpCabArrivedAt = null;
        let firstEmpAttendanceTime = null;
        let boardingDelay = null;
        let emergencyType = null;

        if (trip.employeeTripRequest?.length) {
          // latest emergency type for trip
          const latestRequest = trip.employeeTripRequest.reduce(
            (latest: any, current: any) => {
              return new Date(current.createdAt) > new Date(latest.createdAt)
                ? current
                : latest;
            },
          );
          emergencyType = latestRequest?.emergencyType;

          // find request for first employee
          const empRequest = trip.employeeTripRequest.find(
            (req: any) => String(req.employeeID) === String(firstEmployee.id),
          );
          firstEmpCabArrivedAt = empRequest?.cabArrivedAt || null;
          firstEmpAttendanceTime = empRequest?.attendanceTime || null;

          if (empRequest?.attendanceTime && trip?.estimatedStartDateTime) {
            const attendance = moment(empRequest.attendanceTime);
            const estimatedTime = moment(trip?.estimatedStartDateTime);
            const diffMinutes = attendance.diff(estimatedTime, 'minutes');

            if (diffMinutes <= 0) {
              boardingDelay = 'On Time';
            } else {
              boardingDelay = `${diffMinutes} mins delay`;
            }
          }
        }

        let delayStatus = null;
        if (trip.estimatedStartDateTime && trip.tripActual?.actualStartTime) {
          const estimated = moment(trip.estimatedStartDateTime);
          const actual = moment(
            `${estimated.format('YYYY-MM-DD')} ${
              trip.tripActual.actualStartTime
            }`,
            'YYYY-MM-DD HH:mm:ss',
          );
          const diffMinutes = actual.diff(estimated, 'minutes');
          if (diffMinutes <= 0) {
            delayStatus = 'On Time';
          } else {
            delayStatus = `${diffMinutes} mins delay`;
          }
        }

        return {
          ...trip.toJSON(),
          emergencyType,
          firstEmpCabArrivedAt,
          firstEmpAttendanceTime,
          firstEmpCabArrivalTime,
          delayStatus,
          boardingDelay,
        };
      });
      return {
        totalItems: trips.count,
        items: items,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllReports(
    filterDto: TripReportFilterDto,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const {
        startDate,
        endDate,
        loginTimes,
        logoutTimes,
        status,
        take = 25,
        skip = 0,
        search,
        sortBy = 'date',
        sortOrder = SortOrder.DESC,
      } = filterDto;

      this.logger.log(
        `Finding trips between ${startDate} and ${endDate} with take: ${take}`,
      );

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
              routeNumber: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              vendorCode: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }

      // Add status filter if provided
      if (status && status.length > 0) {
        whereClause.status = {
          [Op.in]: status,
        };
      }

      // Add login times if specified (corresponds to shiftTime for pickups)
      if (loginTimes && loginTimes.length > 0) {
        const loginCondition = {
          pickDrop: 'Pick',
          shiftTime: {
            [Op.in]: loginTimes,
          },
        };

        // Initialize compound conditions if not already added
        if (!whereClause[Op.and]) {
          whereClause[Op.and] = [];
        }

        whereClause[Op.and].push(loginCondition);
      }

      // Add logout times if specified (corresponds to shiftTime for drops)
      if (logoutTimes && logoutTimes.length > 0) {
        const logoutCondition = {
          pickDrop: 'Drop',
          shiftTime: {
            [Op.in]: logoutTimes,
          },
        };

        // If we already have conditions for login times
        if (loginTimes && loginTimes.length > 0) {
          // Create an OR condition between login and logout
          whereClause[Op.or] = [
            { [Op.and]: [whereClause[Op.and][0]] },
            logoutCondition,
          ];

          // Remove the AND condition since we've moved it inside the OR
          delete whereClause[Op.and];
        } else {
          // If we don't have login times, just add the logout condition
          whereClause[Op.or] = [logoutCondition];
        }
      }

      this.logger.debug(`Query where clause: ${JSON.stringify(whereClause)}`);

      // Compute proper offset based on skip and take
      const offset = skip * take;

      // Log if this is an Excel download request
      if (take >= 999999) {
        this.logger.log(
          'Processing Excel download request - fetching all records',
        );
      }

      const trips = await this.tripModel.findAndCountAll({
        where: whereClause,
        limit: take,
        offset: offset,
        order: [[sortBy, sortOrder]],
        attributes: { exclude: ['routeCache'] },
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
            attributes: ['id', 'regNo', 'noOfSeats', 'color', 'fuelType'],
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
            ],
            required: false, // Left join to include trips without actual data
          },
        ],
      });

      this.logger.log(`Found ${trips.count} trips matching the criteria`);

      return {
        totalItems: trips.count,
        items: trips.rows,
        entityPermissions: user?.permissions?.filter(
          (permission) => permission?.split('-')?.[0] === 'Report',
        ),
      };
    } catch (error: any) {
      this.logger.error(
        `Error fetching trip reports: ${error.message}`,
        error.stack,
      );
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Error fetching trip reports');
    }
  }

  async findAllVendorTripReports(
    filterDto: VendorTripReportFilterDto,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const {
        startDate,
        endDate,
        loginTimes,
        logoutTimes,
        status,
        take = 25,
        skip = 0,
        search,
        sortBy = 'date',
        sortOrder = SortOrder.DESC,
        vendorID,
        orgID,
      } = filterDto;

      this.logger.log(
        `Finding vendor trips between ${startDate} and ${endDate} for vendorID: ${vendorID}`,
      );

      // Default to current month if no dates provided
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

      // Base where clause — no orgID filter here (cross-org vendor report)
      let whereClause: any = {
        date: {
          [Op.between]: [finalStartDate, finalEndDate],
        },
      };

      // Vendor filter — required for this report
      if (vendorID) {
        whereClause.vendorID = vendorID;
      } else if (user?.vendorID) {
        // Fallback: if the logged-in user is a vendor user
        whereClause.vendorID = user.vendorID;
      }

      if (orgID) {
        whereClause.orgID = orgID;
      }

      // Search by routeNumber or vendorCode
      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            { routeNumber: { [Op.iLike]: `%${search}%` } },
            { vendorCode: { [Op.iLike]: `%${search}%` } },
          ],
        };
      }

      // Status filter
      if (status && status.length > 0) {
        whereClause.status = { [Op.in]: status };
      }

      // Login times (Pick trips)
      if (loginTimes && loginTimes.length > 0) {
        const loginCondition = {
          pickDrop: 'Pick',
          shiftTime: { [Op.in]: loginTimes },
        };
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
        whereClause[Op.and].push(loginCondition);
      }

      // Logout times (Drop trips)
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

      this.logger.debug(
        `Vendor report where clause: ${JSON.stringify(whereClause)}`,
      );

      const offset = skip * take;

      const trips = await this.tripModel.findAndCountAll({
        where: whereClause,
        limit: take,
        offset,
        order: [[sortBy, sortOrder]],
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name', 'code'],
            required: false,
          },
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name'],
            required: false,
          },
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo', 'noOfSeats', 'color', 'fuelType'],
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
            ],
            required: false,
          },
        ],
      });

      this.logger.log(`Found ${trips.count} vendor trips`);

      return {
        totalItems: trips.count,
        items: trips.rows,
        entityPermissions: user?.permissions?.filter(
          (permission) => permission?.split('-')?.[0] === 'Report',
        ),
      };
    } catch (error: any) {
      this.logger.error(
        `Error fetching vendor trip reports: ${error.message}`,
        error.stack,
      );
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(
        'Error fetching vendor trip reports',
      );
    }
  }

  async getVendorTripDetails(
    filterDto: VendorTripReportFilterDto,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const {
        startDate,
        endDate,
        loginTimes,
        logoutTimes,
        status,
        take = 25,
        skip = 0,
        search,
        sortBy = 'date',
        sortOrder = SortOrder.DESC,
        vendorID,
        orgID,
      } = filterDto;

      this.logger.log(
        `Finding vendor trips between ${startDate} and ${endDate} for vendorID: ${vendorID}`,
      );

      // Default to current month if no date range provided
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

      // Base where clause
      let whereClause: any = {
        date: {
          [Op.between]: [finalStartDate, finalEndDate],
        },
      };

      if (vendorID) {
        whereClause.vendorID = vendorID;
      } else if (user?.vendorID) {
        whereClause.vendorID = user.vendorID;
      }

      if (orgID) {
        whereClause.orgID = orgID;
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
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
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
      const allTrips = await this.tripModel.findAll({
        where: whereClause,
        order: [[sortBy, sortOrder]],
        include: [
          {
            model: Driver,
            as: 'driver',
          },
          {
            model: Cab,
            as: 'cab',
            attributes: [
              'id',
              'regNo',
              'model',
              'rcOwner',
              'color',
              'fuelType',
              'insuranceProvider',
              'insuranceNumber',
            ],
          },
          {
            model: Vendor,
            as: 'vendor',
            attributes: [
              'id',
              'name',
              'code',
              'phone',
              'email',
              'gstNo',
              'address',
            ],
          },
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name'],
          },
          {
            model: Security,
            as: 'security',
            attributes: [
              'id',
              'name',
              'securityCode',
              'phone1',
              'phone2',
              'aadharNumber',
            ],
          },
          {
            model: TripActual,
            as: 'tripActual',
            attributes: [
              'id',
              'tripID',
              'actualDistance',
              'actualStartDate',
              'actualStartTime',
              'actualEndDate',
              'actualEndTime',
              'actualOccupancy',
            ],
          },
          {
            model: TripRequest,
            as: 'tripEmployees',
          },
        ],
      });

      // Flatten trips → one record per TripRequest (employee)
      const flatList: any[] = [];

      for (const trip of allTrips) {
        const tripData = trip.toJSON();
        const tripRequests: any[] = tripData.tripEmployees ?? [];

        for (const req of tripRequests) {
          flatList.push({
            // Employee identity from TripRequest
            employeeID: req.employeeID,
            empCode: req.employeeCode,

            // Attendance fields directly from TripRequest
            attendance: req.attendance,
            attendanceTime: req.attendanceTime,
            attendanceMode: req.attendanceMode,
            pickUpTime: req.pickUpTime,
            dropTime: req.dropTime,
            noShow: req.noShow,
            ratings: req.ratings,
            comments: req.comments,
            cabArrivedAt: req.cabArrivedAt,
            cabWaitingTime: req.cabWaitingTime,
            locationName: req.locationName,
            geoCode: req.geoCode,
            tripRequestID: req.id,

            // Trip fields
            tripID: tripData.id,
            routeNumber: tripData.routeNumber,
            date: tripData.date,
            shiftTime: tripData.shiftTime,
            scheduledTime: tripData.scheduledTime,
            plannedTime: tripData.plannedTime,
            pickDrop: tripData.pickDrop,
            status: tripData.status,
            lockStatus: tripData.lockStatus,
            seats: tripData.seats,
            estimatedDistance: tripData.estimatedDistance,
            estimatedCost: tripData.estimatedCost,
            estimatedOccupancy: tripData.estimatedOccupancy,
            emergencyType: tripData.emergencyType ?? null,
            toll:
              tripData.toll === true
                ? 'Yes'
                : tripData.toll === false
                ? 'No'
                : '-',
            spock:
              tripData.spock === true
                ? 'Yes'
                : tripData.spock === false
                ? 'No'
                : '-',
            tripLocation: tripData.tripLocation,

            // Associations
            driver: tripData.driver ?? null,
            cab: tripData.cab ?? null,
            vendor: tripData.vendor ?? null,
            tripActual: tripData.tripActual ?? null,
            security: tripData.security ?? null,
            org: tripData.org ?? null,
          });
        }
      }
      const totalItems = flatList.length;
      const pageNumber = Number(skip);
      const pageSize = Number(take);
      const paginatedItems = flatList.slice(
        pageNumber * pageSize,
        pageNumber * pageSize + pageSize,
      );

      return {
        totalItems,
        items: paginatedItems,
        entityPermissions: user?.permissions?.filter(
          (permission) => permission?.split('-')?.[0] === 'Report',
        ),
      };
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async getEscortReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const { filters, skip, take, sortBy, sortOrder } = reportFilterInput;
      const { dateRange, escort } = filters;

      const whereCondition: any = {};

      whereCondition.orgID = user.orgID;

      if (dateRange) {
        whereCondition.date = {
          [Op.between]: [dateRange.startDate, dateRange.endDate],
        };
      }

      if (escort) {
        const labelArray = escort.map((item) => item.label);
        whereCondition.spockCode = {
          [Op.in]: labelArray,
        };
      }

      const offset = skip * take;
      const trips = await this.tripModel.findAndCountAll({
        where: {
          ...whereCondition,
          spock: true,
          spockID: { [Op.ne]: null },
        },
        limit: take,
        offset: offset,
        order: [[sortBy, sortOrder]],
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

  async getTipShiftTimes(user: any): Promise<any> {
    const pickShiftTimes = await this.tripModel.findAll({
      where: {
        orgID: user.orgID,
        pickDrop: 'Pick',
      },
      attributes: [
        [Sequelize.fn('DISTINCT', Sequelize.col('shiftTime')), 'shiftTime'],
      ],
      raw: true,
    });
    const dropShiftTimes = await this.tripModel.findAll({
      where: {
        orgID: user.orgID,
        pickDrop: 'Drop',
      },
      attributes: [
        [Sequelize.fn('DISTINCT', Sequelize.col('shiftTime')), 'shiftTime'],
      ],
      raw: true,
    });
    const loginTimes = pickShiftTimes.map((row) => row.shiftTime).sort();
    const logoutTimes = dropShiftTimes.map((row) => row.shiftTime).sort();
    return {
      loginTimes,
      logoutTimes,
    };
  }

  async findAllReportsDetailedVendor(
    filterDto: TripReportFilterDto,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const {
        startDate,
        endDate,
        loginTimes,
        logoutTimes,
        status,
        take = 25,
        skip = 0,
        search,
        sortBy = 'date',
        sortOrder = SortOrder.DESC,
      } = filterDto;

      this.logger.log(
        `Finding detailed vendor trips between ${startDate} and ${endDate} with take: ${take}`,
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

        this.logger.log(
          `No dates provided, using current month: ${finalStartDate} to ${finalEndDate}`,
        );
      }

      let whereClause: any = {
        date: {
          [Op.between]: [finalStartDate, finalEndDate],
        },
      };

      if (user && user.orgID) {
        whereClause.orgID = user.orgID;
        this.logger.debug(`Filtering by organization ID: ${user.orgID}`);
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

      this.logger.debug(`Query where clause: ${JSON.stringify(whereClause)}`);

      const offset = skip * take;

      const trips = await this.tripModel.findAndCountAll({
        where: whereClause,
        limit: take,
        offset: offset,
        order: [[sortBy, sortOrder]],
        // Needed because employeeTripRequest is a hasMany join below - without
        // it, count() would multiply by each trip's number of TripRequest rows
        // instead of counting distinct trips (same fix OTA/OTD already rely on).
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

      this.logger.log(`Found ${trips.count} trips matching the criteria`);

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

        // Present / No Show / Self No Show partition the same TripRequest row
        // exactly once each - rows with attendance === null (never marked)
        // fall into none of the three, by design (Attendance Not Marked was
        // dropped from this report).
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

        // Delay Issue/Reason: mirrors getOTAReport (Pick) / getOTDReport (Drop)
        // magnitude logic, then collapses driver-side + employee-side into one
        // pair. Driver-side takes priority when both are late, since it
        // reflects overall trip lateness; employee-side is only surfaced when
        // the driver was on time but boarding itself still slipped.
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
        `Error fetching detailed vendor trip reports: ${error.message}`,
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
