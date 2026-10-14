import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
} from 'node_modules/@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Trip } from '../models/trip.model';
import { SortOrder, TripStatus } from 'src/shared/enums';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { Cab } from 'src/cabs/models/cab.model';
import { Driver } from 'src/drivers/models/driver.model';
import { Organization } from 'src/organization/models/organization.model';
import { Security } from 'src/security/models/security.model';
import { Employee } from 'src/employee/models/employee.model';
import { col, fn, Op } from 'sequelize';
import { TripFilterInput } from '../dtos/trip-filter-input.dto';
import { ConfirmSafeHomeByPinInput } from '../dtos/mark-safehome-pin-input.dto';
import { Profile } from 'src/profile/model/profile.model';
import * as bcrypt from 'bcryptjs';
/* eslint-disable @typescript-eslint/no-var-requires */
// import * as moment from 'moment';
import {
  clearSafeHomePinAttempts,
  recordFailedSafeHomePinAttempt,
} from 'src/shared/utils/security-pin-attempt-tracker';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { EmailService } from 'src/email/email.service';
import { EmployeeService } from 'src/employee/services/employee-service';
import { GoogleMapsService } from 'src/google-maps/services/google-map-service';
import * as moment from 'moment';
import { Sequelize } from 'sequelize-typescript';

@Injectable()
export class MobApiTripService {
  private logger = new Logger(MobApiTripService.name);
  constructor(
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    private eventlogService: EventLogService,
    @InjectModel(TripRequest)
    private tripRequestModel: typeof TripRequest,
    @InjectModel(Profile)
    private profileModel: typeof Profile,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    private configurationService: ConfigurationService,
    private emailService: EmailService,
    private employeeService: EmployeeService,
    private googleMapService: GoogleMapsService,
  ) {}
  // async getActiveTrip(user: any): Promise<GenericResponse<Trip>> {
  //   const currentDate = new Date().toISOString().split('T')[0]; // Format date as yyyy-mm-dd
  //   try {
  //     const activeTrips = await this.tripModel.findOne({
  //       where: {
  //         status: TripStatus.Ongoing,
  //         date: currentDate,
  //       },
  //       include: [
  //         {
  //           model: TripRequest,
  //           as: 'employeeTripRequest',
  //           where: {
  //             employeeID: user.employeeID,
  //           },
  //         },
  //         {
  //           model: Cab,
  //           attributes: ['id', 'regNo', 'rcOwner', 'color', 'model'],
  //         },
  //         {
  //           model: Driver,
  //           attributes: ['id', 'name', 'email', 'phone', 'address'],
  //         },
  //         {
  //           model: Organization,
  //           attributes: [
  //             'id',
  //             'name',
  //             'email',
  //             'phone',
  //             'geoCode',
  //             'location',
  //             'logo',
  //           ],
  //         },
  //         {
  //           model: Security,
  //           attributes: [
  //             'id',
  //             'name',
  //             'securityCode',
  //             'gender',
  //             'phone1',
  //             'phone2',
  //             'address',
  //             'emergencyContactNo',
  //             'emergencyContactName',
  //           ],
  //         },
  //       ],
  //     });
  //     if (!activeTrips) {
  //       throw new NotFoundException(
  //         'No active trips found for the current date.',
  //       );
  //     }
  //     return {
  //       message: 'Active trip fetched successfully',
  //       data: activeTrips,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  async getActiveTrip(user: any): Promise<GenericResponse<Trip>> {
    // const currentDate = new Date().toISOString().split('T')[0];
    const currentDate = new Date().toLocaleDateString('en-CA');
    try {
      const activeTrips = await this.tripModel.findOne({
        where: {
          status: TripStatus.Ongoing,
          date: currentDate,
        },
        attributes: { exclude: ['routeCache'] },
        include: [
          {
            model: TripRequest,
            as: 'employeeTripRequest',
            where: {
              employeeID: user.employeeID,
            },
          },
          {
            model: Cab,
            attributes: [
              'id',
              'regNo',
              'rcOwner',
              'color',
              'model',
              'noOfSeats',
            ],
          },
          {
            model: Driver,
            attributes: ['id', 'name', 'email', 'phone', 'address'],
          },
          {
            model: Organization,
            attributes: [
              'id',
              'name',
              'email',
              'phone',
              'geoCode',
              'location',
              'logo',
            ],
          },
          {
            model: Security,
            attributes: [
              'id',
              'name',
              'securityCode',
              'gender',
              'phone1',
              'phone2',
              'address',
              'emergencyContactNo',
              'emergencyContactName',
            ],
          },
        ],
      });

      if (!activeTrips) {
        throw new NotFoundException(
          'No active trips found for the current date.',
        );
      }

      // Enrich the JSON employees[] array with phone numbers,
      // since it's stored as a JSON blob and has no live association.
      const tripData = activeTrips.get({ plain: true });

      if (tripData.employees?.length) {
        const employeeIDs = tripData.employees
          .map((emp: any) => emp.id)
          .filter(Boolean);

        const employeeRecords = await this.employeeModel.findAll({
          where: { id: { [Op.in]: employeeIDs } },
          attributes: ['id', 'phone'],
        });

        const phoneMap = new Map(
          employeeRecords.map((emp: any) => [String(emp.id), emp.phone]),
        );

        tripData.employees = tripData.employees.map((emp: any) => ({
          ...emp,
          phone: phoneMap.get(String(emp.id)) ?? null,
        }));
      }

      return {
        message: 'Active trip fetched successfully',
        data: tripData,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getTripListForEmployee(
    tripFilterInput: TripFilterInput,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        date,
      } = tripFilterInput;
      const whereCondition: any = {};
      const currentDate = new Date().toISOString().split('T')[0];

      if (date) {
        whereCondition.date = date;
      } else {
        whereCondition.date = {
          [Op.gte]: currentDate,
        };
      }
      const trips = await this.tripModel.findAndCountAll({
        where: {
          ...whereCondition,
          // employeeID: user.employeeID,
          orgID: user.orgID,
        },
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        // attributes: [
        //   'id',
        //   'date',
        //   'shiftTime',
        //   'employees',
        //   'vendorCode',
        //   'seats',
        //   'estimatedOccupancy',
        //   //   'estimatedStartDateTime',
        //   //   'estimatedEndDateTime',
        //   'estimatedDistance',
        //   'estimatedCost',
        //   'cabID',
        //   'driverID',
        //   'tripLocation',
        //   'pickDrop',
        //   'status',
        //   'lockStatus',
        //   'employees',
        //   'routeNumber',
        //   'orgID',
        // ],
        include: [
          {
            model: Cab,
            attributes: ['id', 'regNo', 'rcOwner', 'color', 'model'],
          },
          {
            model: Driver,
            attributes: ['id', 'name', 'email', 'phone', 'address'],
          },
          {
            model: Organization,
            attributes: [
              'id',
              'name',
              'email',
              'phone',
              'geoCode',
              'location',
              'logo',
            ],
          },
          {
            model: Security,
            attributes: [
              'id',
              'name',
              'securityCode',
              'gender',
              'phone1',
              'phone2',
              'address',
              'emergencyContactNo',
              'emergencyContactName',
            ],
          },
        ],
      });
      const filteredResponse = trips.rows.map((trip) => {
        const matchingEmployee = trip.employees.find(
          (emp) => emp.id === user.employeeID,
        );
        return {
          ...trip.dataValues,
          employees: matchingEmployee ? [matchingEmployee] : [],
        };
      });

      return {
        totalItems: trips.count,
        items: filteredResponse,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string, user: any): Promise<GenericResponse<Trip>> {
    try {
      const tripData = await this.tripModel.findOne({
        where: {
          id: id,
        },
        include: [
          {
            model: TripRequest,
            as: 'employeeTripRequest',
            where: {
              employeeID: user.employeeID,
            },
          },
          {
            model: TripRequest,
            as: 'tripEmployees',
            attributes: [
              'id',
              'employeeID',
              'employeeCode',
              'shiftTime',
              'pickDrop',
              'pickUpTime',
              'dropTime',
              'status',
              'geoCode',
              'locationType',
              'locationName',
              'attendance',
              'attendanceTime',
            ],
            include: [Employee],
          },
          {
            model: Cab,
            attributes: ['id', 'regNo', 'rcOwner', 'color', 'model'],
          },
          {
            model: Driver,
            attributes: ['id', 'name', 'email', 'phone', 'address'],
          },
          {
            model: Organization,
            attributes: [
              'id',
              'name',
              'email',
              'phone',
              'geoCode',
              'location',
              'logo',
            ],
          },
          {
            model: Security,
            attributes: [
              'id',
              'name',
              'securityCode',
              'gender',
              'phone1',
              'phone2',
              'address',
              'emergencyContactNo',
              'emergencyContactName',
            ],
          },
        ],
      });
      if (!tripData) {
        throw new NotFoundException('No  trip found.');
      }
      return {
        message: 'Trip fetched successfully',
        data: tripData,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getCompletedTrips(user: any): Promise<PaginatedList<Trip>> {
    try {
      const activeTrips = await this.tripModel.findAndCountAll({
        where: {
          status: TripStatus.Completed,
        },
        include: [
          {
            model: TripRequest,
            as: 'employeeTripRequest',
            where: {
              employeeID: user.employeeID,
            },
          },
          {
            model: Cab,
            attributes: ['id', 'regNo', 'rcOwner', 'color', 'model'],
          },
          {
            model: Driver,
            attributes: ['id', 'name', 'email', 'phone', 'address'],
          },
          {
            model: Organization,
            attributes: [
              'id',
              'name',
              'email',
              'phone',
              'geoCode',
              'location',
              'logo',
            ],
          },
          {
            model: Security,
            attributes: [
              'id',
              'name',
              'securityCode',
              'gender',
              'phone1',
              'phone2',
              'address',
              'emergencyContactNo',
              'emergencyContactName',
            ],
          },
        ],
      });
      if (!activeTrips) {
        throw new NotFoundException(
          'No active trips found for the current date.',
        );
      }
      return {
        totalItems: activeTrips.count,
        items: activeTrips.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // TripStatus values for reference (Trip.status is the plain TripStatus enum,
  // not the shared Status enum used for TripRequest):
  // Pending | Confirmed | Ongoing | Completed | Cancelled

  private normalizeToArray(value?: string | string[]): string[] | null {
    if (!value) return null;
    const raw = Array.isArray(value) ? value : [value];
    return raw
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  private formatTripDates(trips: Trip[]): Trip[] {
    return trips.map((trip) => {
      trip.setDataValue('date', moment(trip.date).format('DD/MM/YYYY') ?? null);
      return trip;
    });
  }

  async getDriverTrips(
    user: any,
    page?: number,
    limit?: number,
    status?: string | string[],
    period?: string,
    date?: string,
    sortBy?: string,
    sortOrder?: string,
  ): Promise<PaginatedList<Trip>> {
    try {
      // Without a real driverID, the where clause below would silently drop
      // the driverID filter and return every driver's trips. Fail loudly
      // instead of leaking data if this ever gets hit by a non-driver user.
      if (!user?.driverID) {
        throw new ForbiddenException(
          'This endpoint is only accessible to drivers.',
        );
      }

      const whereCondition: any = {
        driverID: user.driverID,
      };

      // Status filter — optional, multi-value (repeated key or comma-separated).
      // No default restriction: omitting it returns trips in every status,
      // matching the original behavior.
      const requestedStatuses = this.normalizeToArray(status);
      if (requestedStatuses && requestedStatuses.length > 0) {
        whereCondition.status = { [Op.in]: requestedStatuses };
      }

      const normalizedPeriod = (period ?? 'future').toLowerCase();
      const currentDate = new Date();
      const formattedDate = currentDate.toISOString().split('T')[0];

      // An exact `date` always wins over `period` — it's the more specific
      // ask, and it's what findAllAssignedTrips used to support on its own.
      let whereConditionDate: any = {};
      if (date) {
        whereConditionDate = { date };
      } else if (normalizedPeriod === 'past') {
        whereConditionDate = {
          [Op.and]: [
            Sequelize.where(fn('DATE', col('Trip.date')), {
              [Op.lt]: formattedDate,
            }),
          ],
        };
      } else {
        // 'future' (default) — includes today, same convention as
        // future-trip-requests.
        whereConditionDate = {
          [Op.and]: [
            Sequelize.where(fn('DATE', col('Trip.date')), {
              [Op.gte]: formattedDate,
            }),
          ],
        };
      }

      const isPaginated =
        page !== undefined &&
        page !== null &&
        limit !== undefined &&
        limit !== null &&
        !isNaN(Number(page)) &&
        !isNaN(Number(limit)) &&
        Number(page) > 0 &&
        Number(limit) > 0;

      // Whitelist sortable columns — an ORDER BY built from raw user input is
      // a much more direct footgun than a WHERE value, so this one does get
      // validated, unlike the status/tripStatus filters elsewhere.
      const sortableColumns = [
        'id',
        'date',
        'shiftTime',
        'status',
        'createdAt',
      ];
      const resolvedSortBy =
        sortBy && sortableColumns.includes(sortBy) ? sortBy : 'date';
      const resolvedSortOrder =
        sortOrder?.toUpperCase() === 'ASC' ||
        sortOrder?.toUpperCase() === 'DESC'
          ? (sortOrder.toUpperCase() as 'ASC' | 'DESC')
          : normalizedPeriod === 'past'
          ? 'DESC' // most recent past trip first
          : 'ASC'; // soonest upcoming trip first

      const queryOptions: any = {
        where: {
          ...whereCondition,
          ...whereConditionDate,
        },
        order: [
          [resolvedSortBy, resolvedSortOrder],
          ['shiftTime', resolvedSortOrder],
        ],
        // Union of every field either endpoint exposed. Metadata columns
        // (createdAt/updatedAt/deletedAt) are deliberately left out — see
        // note below.
        attributes: [
          'id',
          'orgID',
          'cabID',
          'vendorID',
          'driverID',
          'spockID',
          'spockCode',
          'routeNumber',
          'vendorCode',
          'seats',
          'employees',
          'spock',
          'toll',
          'scheduledTime',
          'plannedTime',
          'estimatedOccupancy',
          'estimatedStartDateTime',
          'estimatedEndDateTime',
          'estimatedDistance',
          'estimatedCost',
          'tripLocation',
          'pickDrop',
          'status',
          'lockStatus',
          'routeID',
          'shiftTime',
          'date',
          'routeLegs',
          'emergencyType',
          'vehicleNumber',
          'driverCode',
          'acceptedAt',
          // 'routeCache',
        ],
        include: [
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo', 'rcOwner', 'color', 'model'],
          },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'email', 'phone', 'address'],
          },
          {
            model: Organization,
            as: 'org',
            attributes: [
              'id',
              'name',
              'email',
              'phone',
              'geoCode',
              'location',
              'logo',
            ],
          },
          {
            model: Security,
            as: 'security',
            attributes: [
              'id',
              'name',
              'securityCode',
              'gender',
              'phone1',
              'phone2',
              'address',
              'emergencyContactNo',
              'emergencyContactName',
            ],
          },
        ],
      };

      if (isPaginated) {
        queryOptions.limit = Number(limit);
        queryOptions.offset = (Number(page) - 1) * Number(limit);
      }

      const trips = await this.tripModel.findAndCountAll(queryOptions);
      const formattedTrips = this.formatTripDates(trips.rows);

      return {
        totalItems: trips.count,
        items: formattedTrips,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async confirmSafeHomeByPin(
    input: ConfirmSafeHomeByPinInput, // { tripRequestID, securityPin }
    user?: any,
  ): Promise<GenericResponse<TripRequest>> {
    try {
      const moment = require('moment');

      const { tripRequestID, securityPin } = input;
      const tripRequestKey = String(tripRequestID);
      const tripRequest = await this.tripRequestModel.findOne({
        where: { id: tripRequestID },
      });

      if (!tripRequest) {
        throw new NotFoundException('Trip request not found');
      }

      if (!tripRequest.deboard || !tripRequest.deboardTime) {
        throw new BadRequestException('Deboard has not been marked yet.');
      }

      if (tripRequest.safeHome) {
        throw new BadRequestException('Safe home already confirmed.');
      }

      const SAFE_HOME_PIN_WINDOW_MINUTES = 3;
      const minutesSinceDeboard = moment().diff(
        moment(tripRequest.deboardTime, 'YYYY-MM-DD HH:mm:ss'),
        'minutes',
        true,
      );

      if (minutesSinceDeboard > SAFE_HOME_PIN_WINDOW_MINUTES) {
        throw new BadRequestException(
          'Safe home PIN window has expired. A safety call will be initiated shortly.',
        );
      }

      const profile = await this.profileModel.findOne({
        where: { employeeID: tripRequest.employeeID },
        attributes: ['securityPin'],
      });

      if (!profile?.securityPin) {
        throw new BadRequestException('Security PIN is not set');
      }

      const isValidPin = await bcrypt.compare(securityPin, profile.securityPin);
      if (!isValidPin) {
        const { attemptsExceeded } =
          recordFailedSafeHomePinAttempt(tripRequestKey);

        if (attemptsExceeded) {
          throw new BadRequestException(
            'Too many incorrect attempts. A safety call will be initiated shortly.',
          );
        }
        throw new BadRequestException('Invalid security PIN');
      }
      // Correct PIN — clear attempt history for this trip
      clearSafeHomePinAttempts(tripRequestKey);
      tripRequest.safeHome = true;
      tripRequest.safeHomeTime = moment().format('YYYY-MM-DD HH:mm:ss');
      await tripRequest.save();

      const employee = await this.employeeService.findOne(
        BigInt(tripRequest.employeeID),
      );
      const homePoint = employee?.data?.homePoint;
      let distanceMeters: number | null = null;

      if (homePoint && tripRequest.deboardLocation) {
        const [homeLat, homeLng] = homePoint.split(',').map(Number);
        const [deboardLat, deboardLng] = tripRequest.deboardLocation
          .split(',')
          .map(Number);
        distanceMeters = await this.googleMapService.haversineDistance(
          deboardLat,
          deboardLng,
          homeLat,
          homeLng,
        );
      }

      const alertEmailsRaw = await this.configurationService.getConfigValue(
        'SAFE_HOME_CONFIRMATION_EMAIL_RECIPIENTS',
        BigInt(tripRequest.orgID),
      );
      const mailTo = alertEmailsRaw
        ? alertEmailsRaw
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)
        : [];
      if (mailTo.length > 0) {
        const mapLink = tripRequest.deboardLocation
          ? `https://www.google.com/maps?q=${tripRequest.deboardLocation}`
          : null;
        await this.emailService.sendEmail({
          mailTo,
          subject: 'Employee Reach Home Confirmation Successful',
          templateName: 'safe-home-confirmation',
          mailBody: {
            employeeName: employee?.data?.name,
            employeeCode: tripRequest.employeeCode,
            tripID: tripRequest.tripID ?? tripRequest.id,
            deboardedTime: moment(
              tripRequest.deboardTime,
              'YYYY-MM-DD HH:mm:ss',
            ).format('YYYY-MM-DD HH:mm:ss'),
            distanceMeters:
              distanceMeters !== null ? Math.round(distanceMeters) : null,
            mapLink,
          },
          isAttachments: false,
          attachments: [],
        });
      }

      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripRequest.id,
        authID: user?.id,
        updatedBy: user?.name,
        payload: tripRequest,
        requestPayload: { tripRequestID },
        customDescription: 'confirmed safe home via Security PIN',
        user,
      };
      await this.eventlogService.create(eventLog);

      return {
        message: 'Safe home confirmed successfully via Security PIN.',
        data: tripRequest,
      };
    } catch (err: any) {
      if (err.status) {
        throw err;
      }
      throw new InternalServerErrorException(
        'Failed to confirm safe home via Security PIN',
      );
    }
  }
}
