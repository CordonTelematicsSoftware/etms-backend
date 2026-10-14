import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from 'node_modules/@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Trip } from '../models/trip.model';
import * as XLSX from 'xlsx';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import {
  BillingPlans,
  PickDrop,
  RequestStatus,
  SortOrder,
  Status,
  TripStatus,
  UserType,
} from 'src/shared/enums';
import { TripFilterInput } from '../dtos/trip-filter-input.dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { col, fn, literal, Op } from 'sequelize';
import { CreateTripInput } from '../dtos/create-trip-input.dto';
import {
  DriverMarkNearbyDto,
  DriverMarkNoShowDto,
  UpdateTripInput,
} from '../dtos/update-trip-input.dto';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import * as moment from 'moment';
import 'moment-timezone';
import { Location } from 'src/location-management/locations/models/location.model';
import { Employee } from 'src/employee/models/employee.model';
import { TripRequestService } from 'src/trip-management/trip-request/services/trip-request.service';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Cab } from 'src/cabs/models/cab.model';
import { Driver } from 'src/drivers/models/driver.model';
import { DriverDeviceInfo } from 'src/auth/models/driver-device-model';
import { TripActualsService } from './trip-actuals.service';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Security } from 'src/security/models/security.model';
import { Organization } from 'src/organization/models/organization.model';
import { OrganizationService } from 'src/organization/services/organization.service';
import { GoogleMapsService } from 'src/google-maps/services/google-map-service';
import sequelize from 'sequelize';
import { TripActual } from '../models/trip-actual.model';
import axios from 'axios';
import { ConfigService } from 'node_modules/@nestjs/config';
import { EmployeeEstTimeCalculationService } from 'src/employee/services/employee-est-time-calculation.service';
import { CompleteTripDto } from '../dtos/create-complete-trip.dto';
import { VendorRequest } from 'src/vendor-management/vendor-request/models/vendor-request.model';
import { BulkAssignCabDriverDto } from '../dtos/bulk-assign-cab-driver.dto';
import { normalizeTimeFormat } from 'src/shared/utils/timeUtils';
import {
  parseBufferConfig,
  getBufferForDistance,
} from 'src/shared/utils/bufferUtils';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { SecurityAttendance } from 'src/security/models/securityAttendance.model';
import * as dayjs from 'dayjs';
import { Alert } from 'src/alerts/models/alert.model';
import { OrganizationDriver } from 'src/organization-driver/models/organizationDriver.model';
import { OrganizationCab } from 'src/organization-cab/models/organizationCab.model';
import { trimExcelRow } from 'src/shared/utils/excel.utils';
import { BillingConfigurationService } from 'src/billing-module/services/billing-configuration.service';
import { BillingTripAssignmentDto } from '../dtos/billing-trip-assignment.dto';
import {
  BillingTripAttendanceDto,
  BillingTripCabArrivalDto,
  BillingTripCabArrivedDto,
  BillingTripEmployeeAddDto,
  BillingTripEmployeeOrderDto,
  BillingTripEmployeeRemoveDto,
  BillingTripEstimatedDistanceDto,
} from '../dtos/billing-trip-employees.dto';
import { BillingTripSeatsDto } from '../dtos/billing-trip-seats.dto';
import { CordonGpsApiService } from 'src/cordon-gps/services/cordon-gps-api.service';
import { GpsPoint } from 'src/cordon-gps/interfaces/cordon-gps.interfaces';
import { SaveRouteCacheDto } from '../dtos/route-cache.dto';
import { cordonBatchPointToGpsPoint } from 'src/cordon-gps/utils/cordon-gps-point.mapper';
import { NotificationDispatcherService } from 'src/notifications';
import { NotificationChannel } from 'src/notifications';

// Same body as the helper in trip-actuals.service.ts:38, redeclared here
// because that one is a module-local const and exporting it would mean editing
// the billing service this slice otherwise leaves untouched.
//
// Explicit undefined/null test, never truthiness: `spock: false` and an id of 0
// are legitimate values that a truthy check silently drops.
const isPresent = (value: any): boolean =>
  value !== undefined && value !== null;

@Injectable()
export class TripService {
  private logger = new Logger(TripService.name);
  constructor(
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    @InjectModel(TripRequest)
    private tripRequestModel: typeof TripRequest,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(Vendor)
    private vendorModel: typeof Vendor,
    @InjectModel(Cab)
    private cabModel: typeof Cab,
    @InjectModel(Driver)
    private driverModel: typeof Driver,
    @InjectModel(VendorRequest)
    private vendorRequestModel: typeof VendorRequest,
    @InjectModel(Organization)
    private organizationModel: typeof Organization,
    @InjectModel(OrganizationDriver)
    private orgDriverModel: typeof OrganizationDriver,
    @InjectModel(OrganizationCab)
    private orgCabModel: typeof OrganizationCab,
    @InjectModel(Security)
    private securityModel: typeof Security,

    @Inject(forwardRef(() => TripRequestService))
    private tripRequestService: TripRequestService,
    @Inject(forwardRef(() => TripActualsService))
    private tripActualService: TripActualsService,
    private eventlogService: EventLogService,
    // Not a forwardRef: BillingConfigurationService depends only on BillingRate,
    // so TripService -> BillingConfigurationService is not a cycle.
    private billingConfigurationService: BillingConfigurationService,
    private organizationService: OrganizationService,
    private googleMapService: GoogleMapsService,
    private employeeEstTimeCalculationService: EmployeeEstTimeCalculationService,
    private configService: ConfigService,
    private configurationService: ConfigurationService,
    private cordonGpsApiService: CordonGpsApiService,
    private readonly notificationDispatcher: NotificationDispatcherService,
    private readonly sequelize: Sequelize,
  ) {}

  // async create(
  //   createTripInput: CreateTripInput[],
  //   user: any,
  // ): Promise<GenericResponse<Trip[]>> {
  //   try {
  //     // ============ PHASE 1 — PREFETCH (parallel, no transaction) ============
  //     const [organization, configs] = await Promise.all([
  //       this.organizationService.findOne(user?.orgID),
  //       this.configurationService.getMultipleConfigValues(
  //         ['Cab waiting time', 'Pick Buffer', 'Drop Buffer'],
  //         { orgID: user.orgID },
  //       ),
  //     ]);

  //     const {
  //       'Cab waiting time': cabWaitingTimeBuffer,
  //       'Pick Buffer': rawPickBuffer,
  //       'Drop Buffer': rawDropBuffer,
  //     } = configs?.data || {};

  //     const parsedPickBuffer = parseBufferConfig(rawPickBuffer);
  //     const parsedDropBuffer = parseBufferConfig(rawDropBuffer);

  //     // ============ PHASE 2 — COMPUTE (chunked, no DB writes) ============
  //     const CHUNK_SIZE = 5;
  //     const preparedPayloads: any[] = [];

  //     for (const chunk of this.chunkArray(createTripInput, CHUNK_SIZE)) {
  //       const chunkResults = await Promise.all(
  //         chunk.map(async (input) => {
  //           const formattedEmployees = input?.employees.map((employee) => {
  //             return {
  //               id: employee.id,
  //               name: employee.name,
  //               gender: employee.gender,
  //               address: employee.address,
  //               empCode: employee.empCode,
  //               landmark: employee.landmark,
  //               location: employee.location,
  //               homepoint: employee.employee
  //                 ? employee.employee?.homePoint ?? employee.employee?.homepoint
  //                 : employee?.homePoint ?? employee?.homepoint,
  //               commuteDistance: employee.employee?.commuteDistance,
  //               noShow: employee.noShow,
  //               deboard: false,
  //               attendance: false,
  //               tripRequestID: employee.tripRequestID,
  //               specialConsideration:
  //                 employee.specialConsideration ||
  //                 employee.employee?.specialConsideration,
  //               officeLocation:
  //                 employee.officeLocation ?? employee.employee?.officeLocation, // ← your added line
  //             };
  //           });
  //           const employeeCount = formattedEmployees.length;
  //           let estimatedEndDateTime, estimatedStartDateTime;
  //           let origin, destination, waypoints;

  //           if (input.pickDrop === 'Pick') {
  //             origin = formattedEmployees[0]?.homepoint; // First employee
  //             waypoints = formattedEmployees
  //               .slice(1)
  //               .map((emp) => emp.homepoint)
  //               .filter((point) => point); // Other employees
  //             destination = organization?.data?.geoCode; // Office
  //           } else {
  //             origin = organization?.data?.geoCode; // Office
  //             waypoints = formattedEmployees
  //               .slice(0, formattedEmployees.length - 1)
  //               .map((emp) => emp.homepoint); // Employees
  //             destination =
  //               formattedEmployees[formattedEmployees.length - 1]?.homepoint; // Last employee
  //           }

  //           const cabRouteResponse =
  //             await this.googleMapService.calculateCabRoute(
  //               origin,
  //               destination,
  //               waypoints,
  //             );

  //           // Distance-based buffer lookup — in-memory only
  //           const totalDistanceKm = cabRouteResponse?.totalDistanceKm ?? 0;
  //           let arrivalTimeBuffer = 0;
  //           let dropTimeBuffer = 0;

  //           if (input.pickDrop === 'Pick') {
  //             arrivalTimeBuffer = getBufferForDistance(
  //               parsedPickBuffer,
  //               totalDistanceKm,
  //             );
  //             const totalWaitingTime =
  //               employeeCount * Number(cabWaitingTimeBuffer);
  //             const totalBufferTime = arrivalTimeBuffer + totalWaitingTime;
  //             estimatedEndDateTime = dayjs(`${input.date} ${input.shiftTime}`)
  //               .subtract(totalBufferTime, 'minute')
  //               .toDate();
  //           } else {
  //             dropTimeBuffer = getBufferForDistance(
  //               parsedDropBuffer,
  //               totalDistanceKm,
  //             );
  //             estimatedStartDateTime = dayjs(`${input.date} ${input.shiftTime}`)
  //               .add(dropTimeBuffer, 'minute')
  //               .toDate();
  //           }
  //           // console.log("TripServiceFile: totalDistanceKm: ",totalDistanceKm);
  //           // console.log("TripServiceFile: arrivalTimeBuffer: ",arrivalTimeBuffer);
  //           // console.log("TripServiceFile: dropTimeBuffer: ",dropTimeBuffer);
  //           const employeesWithEstTime =
  //             await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
  //               input.pickDrop,
  //               input.shiftTime,
  //               cabRouteResponse?.legs,
  //               formattedEmployees,
  //               String(arrivalTimeBuffer),
  //               String(dropTimeBuffer),
  //               String(cabWaitingTimeBuffer),
  //             );

  //           delete input.estimatedDistance;

  //           return {
  //             ...input,
  //             estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
  //             employees: employeesWithEstTime, //Assign employees with cab est time
  //             routeLegs: cabRouteResponse?.legs,
  //             orgID: user?.orgID,
  //             emergencyType:
  //               input?.emergencyType == 'null' ? null : input?.emergencyType,
  //             estimatedEndDateTime: estimatedEndDateTime,
  //             estimatedStartDateTime: estimatedStartDateTime,
  //           };
  //         }),
  //       );
  //       preparedPayloads.push(...chunkResults);
  //     }

  //     // ============ PHASE 3 — WRITE (one short transaction) ============
  //     const transaction = await this.sequelize.transaction();
  //     let trips: Trip[];
  //     try {
  //       trips = await this.tripModel.bulkCreate(preparedPayloads, {
  //         transaction,
  //         returning: true,
  //         validate: true, // parity with .create()
  //       });

  //       // bulkCreate returns rows in input order → index i of `trips`
  //       // corresponds to index i of `preparedPayloads`
  //       const tripIdToRequestIds = new Map<bigint, number[]>();
  //       trips.forEach((trip, i) => {
  //         const requestIds = (preparedPayloads[i].employees || [])
  //           .map((emp) => emp?.tripRequestID)
  //           .filter(Boolean);
  //         if (requestIds.length) {
  //           tripIdToRequestIds.set(trip.id, requestIds);
  //         }
  //       });

  //       for (const [tripID, requestIds] of tripIdToRequestIds.entries()) {
  //         await this.tripRequestModel.update(
  //           { tripID },
  //           {
  //             where: { id: { [Op.in]: requestIds } },
  //             transaction,
  //           },
  //         );
  //       }

  //       await transaction.commit();
  //     } catch (error) {
  //       await transaction.rollback();
  //       throw error;
  //     }

  //     const createdTrips = trips.map((t) => t?.dataValues ?? t);

  //     // payload was a raw array of Trip instances with changeType 'add'
  //     // and no changeJSON — DetailTable's payloadJSON branch does
  //     // Object.entries() on an array, giving index keys ("0", "1") with
  //     // no .label, so every row rendered blank. Flat per-trip summary +
  //     // explicit changeJSON instead, same fix as the original create().
  //     const tripSummaries = createdTrips.map((trip) => ({
  //       tripID: String(trip.id),
  //       routeNumber: trip.routeNumber,
  //       pickDrop: trip.pickDrop,
  //       date: trip.date,
  //       shiftTime: trip.shiftTime,
  //       employeeCount: trip.employees?.length ?? 0,
  //       estimatedDistance: trip.estimatedDistance,
  //     }));

  //     const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
  //     tripSummaries.forEach((trip) => {
  //       changeJSON[`Trip ${trip.tripID}`] = {
  //         OldValue: 'N/A',
  //         newValue: `Route ${trip.routeNumber} - ${trip.pickDrop} - ${trip.employeeCount} employee(s) - ${trip.estimatedDistance}`,
  //       };
  //     });

  //     const eventLog = {
  //       objectType: `Trip`,
  //       changeType: 'add',
  //       objectID: createdTrips.length === 1 ? createdTrips[0].id : null,
  //       authID: user.id,
  //       orgID: user?.orgID,
  //       updatedBy: user.name,
  //       payload: tripSummaries,
  //       requestPayload: { createTripInput },
  //       changeJSON,
  //       customDescription: `created ${createdTrips?.length} Trips for ${createTripInput[0]?.date} ${createTripInput[0]?.shiftTime}`,
  //       user,
  //     };
  //     this.eventlogService
  //       .create(eventLog)
  //       .catch((err) => this.logger.error('Event log failed', err));
  //     return {
  //       message: `${createdTrips?.length} trips created successfully.`,
  //       data: createdTrips,
  //     };
  //   } catch (error: any) {
  //     // Real cause goes to logs; client gets the generic message
  //     this.logger.error(`Trip creation failed: ${error.message}`, error.stack);
  //     // Failure event log — mirrors the 'add-failed' pattern used
  //     // elsewhere (e.g. TripRequest.create()). Fire-and-forget, same as
  //     // the success-path log above, so a logging failure here can't mask
  //     // the real error being thrown.
  //     this.eventlogService
  //       .create({
  //         objectType: 'Trip',
  //         changeType: 'add-failed',
  //         objectID: null,
  //         authID: user?.id,
  //         orgID: user?.orgID,
  //         updatedBy: user?.name,
  //         payload: {
  //           date: createTripInput?.[0]?.date,
  //           shiftTime: createTripInput?.[0]?.shiftTime,
  //           tripCount: createTripInput?.length,
  //         },
  //         requestPayload: { createTripInput },
  //         customDescription: `attempted to create Trips - ${error.message}`,
  //         user,
  //       })
  //       .catch((err) => this.logger.error('Event log failed', err));
  //     throw new BadRequestException('Trip creation failed!');
  //   }
  // }

  async create(
    createTripInput: CreateTripInput[],
    user: any,
  ): Promise<GenericResponse<Trip[]>> {
    // A save that outlives the client timeout gets re-POSTed whole on the
    // operator's second click, and Trips has no unique constraint to stop it.
    // Sits outside the try below because that catch rewrites every error to the
    // generic 'Trip creation failed!'. emergencyType is in the key because a
    // regular and an AdHoc save for one date/shift/leg are different sets.
    //
    // "No emergency type" is three distinct values in live data, not one:
    // 97,296 of 97,359 rows hold the EMPTY STRING, 11 hold the literal string
    // 'null', and only the remainder are a real NULL. Normalising all of them
    // to null rendered "emergencyType" IS NULL, which matched none of the
    // 97,296 — the guard was inactive for ~99% of saves. The regular case has
    // to match all three; a named type still matches exactly.
    const EMPTY_EMERGENCY_TYPES = [null, '', 'null'];
    // Sentinel for the dedup key only, never for the query. Distinguishes
    // "regular" from a named type without colliding with one.
    const EMPTY_EMERGENCY_KEY = '<none>';

    const seen = new Set<string>();
    const shiftKeys = [];
    for (const input of createTripInput ?? []) {
      if (!input?.date || !input?.shiftTime || !input?.pickDrop) continue;
      const isRegular = !input.emergencyType || input.emergencyType === 'null';
      const key = [
        input.date,
        input.shiftTime,
        input.pickDrop,
        isRegular ? EMPTY_EMERGENCY_KEY : input.emergencyType,
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      shiftKeys.push({
        date: input.date,
        shiftTime: input.shiftTime,
        pickDrop: input.pickDrop,
        emergencyType: isRegular
          ? { [Op.or]: EMPTY_EMERGENCY_TYPES }
          : input.emergencyType,
      });
    }

    if (shiftKeys.length > 0) {
      // findAndCountAll + limit 1, not findAll: only existence, a count, and
      // one row's date/shift/leg are used, but a clashing shift can hold
      // thousands of rows and findAll hydrated every one into a model instance.
      const alreadySaved = await this.tripModel.findAndCountAll({
        where: {
          orgID: user.orgID,
          // Same predicate as findAllTripsByDate (:1325), which is the query
          // that decides POST-vs-PUT on the Routing page. Without it a shift
          // whose trips are all Cancelled hydrates empty there, the page POSTs,
          // and this guard rejects with a "reload the page" message pointing at
          // a board that will still be empty — leaving the shift unsavable.
          status: { [Op.ne]: TripStatus.Cancelled },
          [Op.or]: shiftKeys,
        },
        attributes: ['date', 'shiftTime', 'pickDrop', 'emergencyType'],
        limit: 1,
      });

      if (alreadySaved.count > 0) {
        const clash = alreadySaved.rows[0];
        // Empty string is falsy, so a regular trip still reads as bare pickDrop.
        const leg = clash.emergencyType
          ? `${clash.pickDrop} / ${clash.emergencyType}`
          : clash.pickDrop;
        throw new BadRequestException(
          `Trips already exist for ${clash.date} ${clash.shiftTime} (${leg}) — ` +
            `${alreadySaved.count} trip(s) found. A previous save may have completed ` +
            `after the page timed out.`,
        );
      }
    }

    try {
      // ============ PHASE 1 — PREFETCH (parallel, no transaction) ============
      const [organization, configs] = await Promise.all([
        this.organizationService.findOne(user?.orgID),
        this.configurationService.getMultipleConfigValues(
          ['Cab waiting time', 'Pick Buffer', 'Drop Buffer'],
          { orgID: user.orgID },
        ),
      ]);

      const {
        'Cab waiting time': cabWaitingTimeBuffer,
        'Pick Buffer': rawPickBuffer,
        'Drop Buffer': rawDropBuffer,
      } = configs?.data || {};

      const parsedPickBuffer = parseBufferConfig(rawPickBuffer);
      const parsedDropBuffer = parseBufferConfig(rawDropBuffer);

      // ============ PHASE 2 — COMPUTE (chunked, no DB writes) ============
      const CHUNK_SIZE = 5;
      const preparedPayloads: any[] = [];

      for (const chunk of this.chunkArray(createTripInput, CHUNK_SIZE)) {
        const chunkResults = await Promise.all(
          chunk.map(async (input) => {
            const formattedEmployees = input?.employees.map((employee) => {
              return {
                id: employee.id,
                name: employee.name,
                gender: employee.gender,
                address: employee.address,
                empCode: employee.empCode,
                landmark: employee.landmark,
                location: employee.location,
                homepoint: employee.employee
                  ? employee.employee?.homePoint ?? employee.employee?.homepoint
                  : employee?.homePoint ?? employee?.homepoint,
                commuteDistance: employee.employee?.commuteDistance,
                noShow: employee.noShow,
                deboard: false,
                attendance: false,
                tripRequestID: employee.tripRequestID,
                specialConsideration:
                  employee.specialConsideration ||
                  employee.employee?.specialConsideration,
                officeLocation:
                  employee.officeLocation ?? employee.employee?.officeLocation, // ← your added line
              };
            });
            const employeeCount = formattedEmployees.length;
            let estimatedEndDateTime, estimatedStartDateTime;
            let origin, destination, waypoints;

            if (input.pickDrop === 'Pick') {
              origin = formattedEmployees[0]?.homepoint; // First employee
              waypoints = formattedEmployees
                .slice(1)
                .map((emp) => emp.homepoint)
                .filter((point) => point); // Other employees
              destination = organization?.data?.geoCode; // Office
            } else {
              origin = organization?.data?.geoCode; // Office
              waypoints = formattedEmployees
                .slice(0, formattedEmployees.length - 1)
                .map((emp) => emp.homepoint); // Employees
              destination =
                formattedEmployees[formattedEmployees.length - 1]?.homepoint; // Last employee
            }

            const cabRouteResponse =
              await this.googleMapService.calculateCabRoute(
                origin,
                destination,
                waypoints,
              );

            // Distance-based buffer lookup — in-memory only
            const totalDistanceKm = cabRouteResponse?.totalDistanceKm ?? 0;
            let arrivalTimeBuffer = 0;
            let dropTimeBuffer = 0;

            if (input.pickDrop === 'Pick') {
              arrivalTimeBuffer = getBufferForDistance(
                parsedPickBuffer,
                totalDistanceKm,
              );
              const totalWaitingTime =
                employeeCount * Number(cabWaitingTimeBuffer);
              const totalBufferTime = arrivalTimeBuffer + totalWaitingTime;
              estimatedEndDateTime = dayjs(`${input.date} ${input.shiftTime}`)
                .subtract(totalBufferTime, 'minute')
                .toDate();
            } else {
              dropTimeBuffer = getBufferForDistance(
                parsedDropBuffer,
                totalDistanceKm,
              );
              estimatedStartDateTime = dayjs(`${input.date} ${input.shiftTime}`)
                .add(dropTimeBuffer, 'minute')
                .toDate();
            }
            // console.log("TripServiceFile: totalDistanceKm: ",totalDistanceKm);
            // console.log("TripServiceFile: arrivalTimeBuffer: ",arrivalTimeBuffer);
            // console.log("TripServiceFile: dropTimeBuffer: ",dropTimeBuffer);
            const employeesWithEstTime =
              await this.employeeEstTimeCalculationService.calculateEmployeeEstTimeNew(
                input.pickDrop,
                input.shiftTime,
                cabRouteResponse?.legs,
                formattedEmployees,
                String(arrivalTimeBuffer),
                String(dropTimeBuffer),
                String(cabWaitingTimeBuffer),
              );

            delete input.estimatedDistance;

            return {
              ...input,
              estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
              employees: employeesWithEstTime, //Assign employees with cab est time
              routeLegs: cabRouteResponse?.legs,
              orgID: user?.orgID,
              emergencyType:
                input?.emergencyType == 'null' ? null : input?.emergencyType,
              estimatedEndDateTime: estimatedEndDateTime,
              estimatedStartDateTime: estimatedStartDateTime,
            };
          }),
        );
        preparedPayloads.push(...chunkResults);
      }

      // ============ PHASE 3 — WRITE (one short transaction) ============
      const transaction = await this.sequelize.transaction();
      let trips: Trip[];
      try {
        trips = await this.tripModel.bulkCreate(preparedPayloads, {
          transaction,
          returning: true,
          validate: true, // parity with .create()
        });

        // bulkCreate returns rows in input order → index i of trips
        // corresponds to index i of preparedPayloads
        const tripIdToRequestIds = new Map<bigint, number[]>();
        trips.forEach((trip, i) => {
          const requestIds = (preparedPayloads[i].employees || [])
            .map((emp) => emp?.tripRequestID)
            .filter(Boolean);
          if (requestIds.length) {
            tripIdToRequestIds.set(trip.id, requestIds);
          }
        });

        for (const [tripID, requestIds] of tripIdToRequestIds.entries()) {
          await this.tripRequestModel.update(
            { tripID },
            {
              where: { id: { [Op.in]: requestIds } },
              transaction,
            },
          );
        }

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }

      const createdTrips = trips.map((t) => t?.dataValues ?? t);

      // payload was a raw array of Trip instances with changeType 'add'
      // and no changeJSON — DetailTable's payloadJSON branch does
      // Object.entries() on an array, giving index keys ("0", "1") with
      // no .label, so every row rendered blank. Flat per-trip summary +
      // explicit changeJSON instead, same fix as the original create().
      const tripSummaries = createdTrips.map((trip) => ({
        tripID: String(trip.id),
        routeNumber: trip.routeNumber,
        pickDrop: trip.pickDrop,
        date: trip.date,
        shiftTime: trip.shiftTime,
        employeeCount: trip.employees?.length ?? 0,
        estimatedDistance: trip.estimatedDistance,
      }));

      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      tripSummaries.forEach((trip) => {
        changeJSON[`Trip ${trip.tripID}`] = {
          OldValue: 'N/A',
          newValue: `Route ${trip.routeNumber} - ${trip.pickDrop} - ${trip.employeeCount} employee(s) - ${trip.estimatedDistance}`,
        };
      });

      const eventLog = {
        objectType: `Trip`,
        changeType: 'add',
        objectID: createdTrips.length === 1 ? createdTrips[0].id : null,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: tripSummaries,
        requestPayload: { createTripInput },
        changeJSON,
        customDescription: `created ${createdTrips?.length} Trips for ${createTripInput[0]?.date} ${createTripInput[0]?.shiftTime}`,
        user,
      };
      this.eventlogService
        .create(eventLog)
        .catch((err) => this.logger.error('Event log failed', err));
      return {
        message: `${createdTrips?.length} trips created successfully.`,
        data: createdTrips,
      };
    } catch (error: any) {
      // Real cause goes to logs; client gets the generic message
      this.logger.error(`Trip creation failed: ${error.message}`, error.stack);
      // Failure event log — mirrors the 'add-failed' pattern used
      // elsewhere (e.g. TripRequest.create()). Fire-and-forget, same as
      // the success-path log above, so a logging failure here can't mask
      // the real error being thrown.
      this.eventlogService
        .create({
          objectType: 'Trip',
          changeType: 'add-failed',
          objectID: null,
          authID: user?.id,
          orgID: user?.orgID,
          updatedBy: user?.name,
          payload: {
            date: createTripInput?.[0]?.date,
            shiftTime: createTripInput?.[0]?.shiftTime,
            tripCount: createTripInput?.length,
          },
          requestPayload: { createTripInput },
          customDescription: `attempted to create Trips - ${error.message}`,
          user,
        })
        .catch((err) => this.logger.error('Event log failed', err));
      throw new BadRequestException('Trip creation failed!');
    }
  }

  async update(
    updateTripInput: UpdateTripInput,
    user: any,
    shiftTime: string,
    date: string,
  ): Promise<any> {
    try {
      // ============ PHASE 1 — PREFETCH (parallel, no transaction) ============
      const [organization, bufferConfig] = await Promise.all([
        this.organizationService.findOne(user?.orgID),
        this.configurationService.getMultipleConfigValues(
          ['Cab waiting time', 'Pick Buffer', 'Drop Buffer'],
          { orgID: user.orgID },
        ),
      ]);

      const {
        'Cab waiting time': cabWaitingTimeBuffer,
        'Pick Buffer': rawPickBuffer,
        'Drop Buffer': rawDropBuffer,
      } = bufferConfig?.data || {};

      const parsedPickBuffer = parseBufferConfig(rawPickBuffer);
      const parsedDropBuffer = parseBufferConfig(rawDropBuffer);

      const tripsToProcess = updateTripInput?.updatedTrips ?? [];

      // Replace N × findByPk with ONE bulk query
      const existingTripIds = tripsToProcess
        .filter((t) => t?.id)
        .map((t) => t.id);

      const existingTripMap = new Map<string, Trip>();
      if (existingTripIds.length > 0) {
        const existingTrips = await this.tripModel.findAll({
          where: { id: { [Op.in]: existingTripIds } },
        });
        existingTrips.forEach((t) => existingTripMap.set(String(t.id), t));
      }

      // ============ PHASE 2 — COMPUTE (chunked, no transaction) ============
      const CHUNK_SIZE = 5;
      const prepared: Array<{
        trip: any;
        isExisting: boolean;
        existingTrip?: Trip;
        employeesWithEstTime: any[];
        cabRouteResponse: any;
        estimatedStartDateTime?: any;
        estimatedEndDateTime?: any;
      }> = [];

      for (const chunk of this.chunkArray(tripsToProcess, CHUNK_SIZE)) {
        const chunkResults = await Promise.all(
          chunk.map(async (trip) => {
            const existingTrip = trip?.id
              ? existingTripMap.get(String(trip.id))
              : undefined;

            const formattedEmployees = trip?.employees?.map((employee) => ({
              id: employee?.id,
              name: employee.name,
              gender: employee.gender,
              address: employee.address,
              empCode: employee.empCode,
              landmark: employee.landmark,
              location: employee.location,
              tripRequestID: employee?.tripRequestID,
              homepoint: employee?.employee?.homePoint || employee?.homepoint,
              commuteDistance:
                employee?.employee?.commuteDistance ||
                employee?.commuteDistance,
              noShow: employee.noShow,
              deboard: employee?.deboard ?? false,
              attendance: employee.attendance ?? false,
              specialConsideration:
                employee.specialConsideration ||
                employee.employee?.specialConsideration,
            }));

            const employeeCount = formattedEmployees?.length ?? 0;

            let origin, destination, waypoints;

            if (trip.pickDrop === 'Pick') {
              origin = formattedEmployees[0]?.homepoint;
              waypoints = formattedEmployees
                ?.slice(1)
                .map((emp) => emp.homepoint)
                .filter((point) => point);
              destination = organization?.data?.geoCode;
            } else {
              origin = organization?.data?.geoCode;
              waypoints = formattedEmployees
                ?.slice(0, formattedEmployees?.length - 1)
                .map((emp) => emp.homepoint);
              destination =
                formattedEmployees[formattedEmployees?.length - 1]?.homepoint;
            }

            const cabRouteResponse =
              await this.googleMapService.calculateCabRoute(
                origin,
                destination,
                waypoints,
              );

            const totalDistanceKm = cabRouteResponse?.totalDistanceKm ?? 0;
            const bufferMinutes = getBufferForDistance(
              trip.pickDrop === 'Pick' ? parsedPickBuffer : parsedDropBuffer,
              totalDistanceKm,
            );
            const arrivalTimeBuffer =
              trip.pickDrop === 'Pick' ? bufferMinutes : 0;
            const dropTimeBuffer = trip.pickDrop === 'Drop' ? bufferMinutes : 0;

            const effectiveDate = date || trip?.date || existingTrip?.date;
            const effectiveShiftTime =
              shiftTime || trip?.shiftTime || existingTrip?.shiftTime;

            let estimatedEndDateTime;
            let estimatedStartDateTime;

            if (effectiveDate && effectiveShiftTime) {
              if (trip.pickDrop === 'Pick') {
                const totalWaitingTime =
                  employeeCount * Number(cabWaitingTimeBuffer);
                const totalBufferTime = arrivalTimeBuffer + totalWaitingTime;
                estimatedEndDateTime = dayjs(
                  `${effectiveDate} ${effectiveShiftTime}`,
                )
                  .subtract(totalBufferTime, 'minute')
                  .toDate();
              } else {
                estimatedStartDateTime = dayjs(
                  `${effectiveDate} ${effectiveShiftTime}`,
                )
                  .add(dropTimeBuffer, 'minute')
                  .toDate();
              }
            }

            const employeesWithEstTime =
              await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
                trip.pickDrop,
                shiftTime,
                cabRouteResponse?.legs,
                formattedEmployees,
                String(arrivalTimeBuffer),
                String(dropTimeBuffer),
                String(cabWaitingTimeBuffer),
              );

            return {
              trip,
              isExisting: Boolean(trip?.id),
              existingTrip: trip?.id
                ? existingTripMap.get(String(trip.id))
                : undefined,
              employeesWithEstTime,
              cabRouteResponse,
              estimatedStartDateTime,
              estimatedEndDateTime,
            };
          }),
        );
        prepared.push(...chunkResults);
      }

      // ============ PHASE 3 — WRITE (one short transaction) ============
      const transaction = await this.sequelize.transaction();
      try {
        if (updateTripInput?.removedTrips?.length) {
          await this.tripModel.destroy({
            where: { id: { [Op.in]: updateTripInput.removedTrips } },
            transaction,
          });
          await this.tripRequestModel.update(
            { tripID: null },
            {
              where: { tripID: { [Op.in]: updateTripInput.removedTrips } },
              transaction,
            },
          );
        }

        const updatedTrips: any[] = [];

        for (const item of prepared) {
          const {
            trip,
            isExisting,
            existingTrip,
            employeesWithEstTime,
            cabRouteResponse,
            estimatedStartDateTime,
            estimatedEndDateTime,
          } = item;

          const estimatedDateTimes: any = {};
          if (estimatedEndDateTime) {
            estimatedDateTimes.estimatedEndDateTime = estimatedEndDateTime;
          }
          if (estimatedStartDateTime) {
            estimatedDateTimes.estimatedStartDateTime = estimatedStartDateTime;
          }

          if (isExisting) {
            const preservedVendorData = {
              vendorID:
                trip?.vendorID !== null
                  ? trip?.vendorID
                  : existingTrip?.vendorID,
              vendorCode:
                trip?.vendorCode !== null
                  ? trip?.vendorCode
                  : existingTrip?.vendorCode,
              cabID: trip?.cabID !== null ? trip?.cabID : existingTrip?.cabID,
              driverID:
                trip?.driverID !== null
                  ? trip?.driverID
                  : existingTrip?.driverID,
              spockID:
                trip?.spockID !== null ? trip?.spockID : existingTrip?.spockID,
              spockCode:
                trip?.spockCode !== null
                  ? trip?.spockCode
                  : existingTrip?.spockCode,
              toll: trip?.toll !== undefined ? trip?.toll : existingTrip?.toll,
              status: existingTrip?.status ?? trip?.status,
              lockStatus: existingTrip?.lockStatus ?? trip?.lockStatus,
            };

            const updatedTrip = await this.tripModel.update(
              {
                ...trip,
                employees: employeesWithEstTime,
                ...preservedVendorData,
                estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
                routeLegs: cabRouteResponse?.legs,
                emergencyType:
                  trip.emergencyType == 'null' ? null : trip.emergencyType,
                ...estimatedDateTimes,
              },
              {
                where: {
                  ...(shiftTime ? { shiftTime } : {}),
                  ...(date ? { date } : {}),
                  id: trip?.id,
                  orgID: user?.orgID ? user.orgID : trip.orgID,
                },
                returning: true,
                transaction,
              },
            );

            if (trip?.employees?.length) {
              const tripRequestIds = trip.employees
                .map((employee) => employee?.tripRequestID)
                .filter(Boolean);

              if (tripRequestIds.length) {
                await this.tripRequestModel.update(
                  { tripID: trip.id },
                  {
                    where: { id: { [Op.in]: tripRequestIds } },
                    transaction,
                  },
                );
              }
            }
            updatedTrips.push(updatedTrip?.[1]?.[0]);
          } else {
            const newTrip = await this.tripModel.create(
              {
                ...trip,
                employees: employeesWithEstTime,
                orgID: user?.orgID,
                shiftTime: shiftTime,
                date: date,
                estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
                routeLegs: cabRouteResponse?.legs,
                ...estimatedDateTimes,
              },
              { transaction },
            );

            if (trip?.employees?.length) {
              const tripRequestIds = trip.employees
                .map((employee) => employee?.tripRequestID)
                .filter(Boolean);

              if (tripRequestIds.length) {
                await this.tripRequestModel.update(
                  { tripID: newTrip.id },
                  {
                    where: { id: { [Op.in]: tripRequestIds } },
                    transaction,
                  },
                );
              }
            }
            updatedTrips.push(newTrip);
          }
        }

        await transaction.commit();

        // Event log — mirrors create()'s summary + changeJSON pattern,
        // extended to cover all three outcomes this endpoint can produce:
        // existing trips get a real Old→New diff (existingTripMap already
        // has pre-update state from Phase 1), newly-created trips get
        // OldValue: 'N/A' like create(), and removed trips get a
        // lightweight Existed→Removed row (no extra fetch added to
        // describe their prior state — this function doesn't look them
        // up before destroying them today).
        const normalizedTrips = updatedTrips.map((t) => t?.dataValues ?? t);
        const changeJSON: Record<string, any> = {};
        const tripSummaries: any[] = [];

        normalizedTrips.forEach((trip, i) => {
          if (!trip) return; // update() found no matching row for this one
          const { isExisting, existingTrip } = prepared[i] ?? {};
          const tripID = String(trip.id);
          const employeeCount = trip.employees?.length ?? 0;

          tripSummaries.push({
            tripID,
            routeNumber: trip.routeNumber,
            pickDrop: trip.pickDrop,
            date: trip.date,
            shiftTime: trip.shiftTime,
            employeeCount,
            estimatedDistance: trip.estimatedDistance,
          });

          const newValue = `Route ${trip.routeNumber} - ${trip.pickDrop} - ${employeeCount} employee(s) - ${trip.estimatedDistance}`;

          if (isExisting && existingTrip) {
            const oldEmployeeCount = existingTrip.employees?.length ?? 0;
            changeJSON[`Trip ${tripID}`] = {
              OldValue: `Route ${existingTrip.routeNumber} - ${existingTrip.pickDrop} - ${oldEmployeeCount} employee(s) - ${existingTrip.estimatedDistance}`,
              newValue,
            };
          } else {
            changeJSON[`Trip ${tripID}`] = {
              OldValue: 'N/A',
              newValue,
            };
          }
        });

        const removedTripIDs = updateTripInput?.removedTrips ?? [];
        removedTripIDs.forEach((removedID) => {
          changeJSON[`Trip ${removedID}`] = {
            OldValue: 'Existed',
            newValue: 'Removed',
          };
        });

        const updatedCount = tripSummaries.length;
        const removedCount = removedTripIDs.length;

        if (updatedCount > 0 || removedCount > 0) {
          const descriptionParts: string[] = [];
          if (updatedCount > 0)
            descriptionParts.push(`updated ${updatedCount} trip(s)`);
          if (removedCount > 0)
            descriptionParts.push(`removed ${removedCount} trip(s)`);

          const totalAffected = updatedCount + removedCount;
          const eventLog = {
            objectType: 'Trip',
            changeType: 'edit',
            objectID:
              totalAffected === 1
                ? tripSummaries[0]?.tripID ?? removedTripIDs[0]
                : null,
            authID: user.id,
            orgID: user?.orgID,
            updatedBy: user.name,
            payload: { tripSummaries, removedTripIDs },
            requestPayload: { updateTripInput, shiftTime, date },
            changeJSON,
            customDescription: `${descriptionParts.join(
              ' and ',
            )} for ${date} ${shiftTime}`,
            user,
          };
          this.eventlogService
            .create(eventLog)
            .catch((err) => this.logger.error('Event log failed', err));
        }

        return {
          message: 'Trips updated successfully',
          data: updatedTrips,
        };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error: any) {
      this.logger.error(`Trip update failed: ${error.message}`, error.stack);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // ============ HELPER — add once as a private method ============
  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < (arr?.length ?? 0); i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  async findAll(
    tripFilterInput: TripFilterInput,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        filter,
        orgID,
      } = tripFilterInput;
      let whereCondition: any = {};
      //   if (!whereCondition) {
      //     whereCondition = {};
      //   }
      if (user.userType != UserType.Vendor) {
        whereCondition.orgID = user?.orgID;
      }

      if (user.vendorID) {
        whereCondition.vendorID = user?.vendorID;
      }
      if (orgID) {
        whereCondition.orgID = orgID;
      }

      if (filter) {
        const filterConditions = this.buildFilterCondition(JSON.parse(filter));
        whereCondition = { ...whereCondition, [Op.and]: filterConditions };
      }
      const trips = await this.tripModel.findAndCountAll({
        where: whereCondition,
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        attributes: [
          'id',
          'date',
          'shiftTime',
          'employees',
          'vendorCode',
          'seats',
          'estimatedOccupancy',
          //   'estimatedStartDateTime',
          //   'estimatedEndDateTime',
          'estimatedDistance',
          'estimatedCost',
          'cabID',
          'driverID',
          'tripLocation',
          'pickDrop',
          'status',
          'lockStatus',
          'employees',
          'routeNumber',
          'orgID',
          'driverCode',
          'vehicleNumber',
        ],
        // include: [
        //   {
        //     model: Organization,
        //     as: 'org',
        //     attributes: ['id', 'name'],
        //   },
        //   {
        //     model: Driver,
        //     as: 'driver',
        //     attributes: ['name'],
        //   },
        //   {
        //     model: Cab,
        //     as: 'cab',
        //     attributes: ['name'],
        //   },
        // ],
      });
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

  private buildFilterCondition(filter: any): any[] {
    const conditions: any[] = [];

    if (filter?.operation && filter?.items) {
      const logicalOperator = filter.operation === 'and' ? Op.and : Op.or;

      filter.items.forEach((item: any) => {
        const { column, operator, value } = item;
        const columnPath = column.includes('.') ? `$${column}$` : column;

        let condition: any;
        switch (operator) {
          case 'eq':
            condition = { [columnPath]: { [Op.eq]: value } };
            break;
          case 'ne':
            condition = { [columnPath]: { [Op.ne]: value } };
            break;
          case 'gt':
            condition = { [columnPath]: { [Op.gt]: value } };
            break;
          case 'gte':
            condition = { [columnPath]: { [Op.gte]: value } };
            break;
          case 'lt':
            condition = { [columnPath]: { [Op.lt]: value } };
            break;
          case 'lte':
            condition = { [columnPath]: { [Op.lte]: value } };
            break;
          case 'like':
            condition = { [columnPath]: { [Op.like]: `%${value}%` } };
            break;
          case 'in':
            condition = { [columnPath]: { [Op.in]: value } };
            break;
          default:
            throw new Error(`Unsupported operator: ${operator}`);
        }

        if (condition) {
          conditions.push(condition);
        }
      });

      return [{ [logicalOperator]: conditions }];
    }

    return [];
  }

  private formatTripDates(trips: Trip[]): Trip[] {
    return trips.map((trip) => {
      trip.setDataValue('date', moment(trip.date).format('DD/MM/YYYY') ?? null);
      return trip;
    });
  }

  //old one with the sequelize.literal(asked to change)
  // async findAllTripsByDate(
  //   shiftTime: string,
  //   date: string,
  //   user: any,
  //   pickDrop: boolean,
  //   tripFilterInput?: TripFilterInput,
  //   requestType?: string,
  // ): Promise<PaginatedList<Trip>> {
  //   try {
  //     const {
  //       take,
  //       skip,
  //       // sortBy = 'id',
  //       // sortOrder = SortOrder.DESC,
  //       // filter,
  //       // orgID,
  //       search,
  //     } = tripFilterInput || {}; // Handle undefined case
  //     // Build the base query
  //     const query: any = {
  //       where: {
  //         shiftTime,
  //         date,
  //         orgID: user.orgID,
  //         pickDrop: pickDrop ? PickDrop?.Pick : PickDrop?.Drop,
  //         status: { [Op.ne]: TripStatus.Cancelled },
  //         emergencyType: requestType
  //           ? requestType != 'null'
  //             ? requestType
  //             : null
  //           : null,
  //       },
  //       order: [['routeNumber', 'ASC']],
  //       distinct: true,
  //       include: [
  //         {
  //           model: Driver,
  //           as: 'driver',
  //           attributes: ['name'],
  //           required: false,
  //         },
  //         {
  //           model: Cab,
  //           as: 'cab',
  //           attributes: ['regNo', 'model', 'noOfSeats'],
  //           required: false,
  //         },
  //         {
  //           model: Organization,
  //           attributes: ['id', 'name', 'geoCode'],
  //         },
  //         {
  //           model: Security,
  //           as: 'security',
  //           attributes: ['id', 'name'],
  //         },
  //         {
  //           model: TripRequest,
  //           as: 'employeeTripRequest',
  //           attributes: [
  //             'id',
  //             'employeeID',
  //             'employeeCode',
  //             'status',
  //             'emergencyType',
  //             'officeLocation',
  //           ],
  //         },
  //       ],
  //     };
  //     if (search) {
  //       query.where = {
  //         ...query.where,
  //         [Op.or]: [
  //           Sequelize.literal(`CAST("Trip"."id" AS TEXT) ILIKE '%${search}%'`),
  //           { vendorCode: { [Op.iLike]: `%${search}%` } },
  //           { routeNumber: { [Op.iLike]: `%${search}%` } },
  //           { tripLocation: { [Op.iLike]: `%${search}%` } },
  //           { spockCode: { [Op.iLike]: `%${search}%` } },
  //           { estimatedDistance: { [Op.iLike]: `%${search}%` } },
  //           { plannedTime: { [Op.iLike]: `%${search}%` } },
  //           // { '$driver.name$': { [Op.iLike]: `%${search}%` } },
  //           // { '$security.name$': { [Op.iLike]: `%${search}%` } },
  //           // { '$cab.regNo$': { [Op.iLike]: `%${search}%` } },
  //           Sequelize.literal(`
  //       EXISTS (
  //         SELECT 1 FROM "Drivers" AS "driver"
  //         WHERE "driver"."id" = "Trip"."driverID"
  //         AND "driver"."name" ILIKE '%${search}%'
  //       )
  //     `),
  //           Sequelize.literal(`
  //       EXISTS (
  //         SELECT 1 FROM "Securities" AS "security"
  //         WHERE "security"."id" = "Trip"."spockID"
  //         AND "security"."name" ILIKE '%${search}%'
  //       )
  //     `),
  //           Sequelize.literal(`
  //       EXISTS (
  //         SELECT 1 FROM "Cabs" AS "cab"
  //         WHERE "cab"."id" = "Trip"."cabID"
  //         AND "cab"."regNo" ILIKE '%${search}%'
  //       )
  //     `),
  //           // Search inside JSON employees array (by name)
  //           Sequelize.literal(`
  //             EXISTS (
  //               SELECT 1 FROM jsonb_array_elements("Trip"."employees") AS emp
  //               WHERE emp->>'name' ILIKE '%${search}%'
  //                OR emp->>'employeeCode' ILIKE '%${search}%'
  //                OR emp->>'address' ILIKE '%${search}%'
  //                OR emp->>'gender' ILIKE '%${search}%'
  //                OR emp->>'cabArrivalTime' ILIKE '%${search}%'
  //                OR emp->>'commuteDistance' ILIKE '%${search}%'
  //                OR emp->>'location' ILIKE '%${search}%'
  //             )
  //           `),
  //         ],
  //       };
  //     }

  //     // Add pagination only if input was passed
  //     if (tripFilterInput && take !== undefined && skip !== undefined) {
  //       query.limit = take;
  //       // query.offset = skip * take;
  //       query.offset = search ? 0 : skip * take;
  //     }

  //     const trip = await this.tripModel.findAndCountAll(query);
  //     trip.rows.reduce(
  //       (acc, trip) =>
  //         acc +
  //         (trip.employees?.length || trip.employeeTripRequest?.length || 0),
  //       0,
  //     );

  //     if (trip) {
  //       return {
  //         totalItems: trip.count,
  //         items: trip.rows,
  //       };
  //     } else {
  //       throw new NotFoundException('Invalid date and time');
  //     }
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  //sequelize.literal (but solved the sql injection)
  // async findAllTripsByDate(
  //   shiftTime: string,
  //   date: string,
  //   user: any,
  //   pickDrop: boolean,
  //   tripFilterInput?: TripFilterInput,
  //   requestType?: string,
  // ): Promise<PaginatedList<Trip>> {
  //   try {
  //     const { take, skip, search } = tripFilterInput || {};

  //     const query: any = {
  //       where: {
  //         shiftTime,
  //         date,
  //         orgID: user.orgID,
  //         pickDrop: pickDrop ? PickDrop?.Pick : PickDrop?.Drop,
  //         status: { [Op.ne]: TripStatus.Cancelled },
  //         emergencyType: requestType
  //           ? requestType != 'null'
  //             ? requestType
  //             : null
  //           : null,
  //       },
  //       order: [['routeNumber', 'ASC']],
  //       distinct: true,
  //       include: [
  //         {
  //           model: Driver,
  //           as: 'driver',
  //           attributes: ['name'],
  //           required: false,
  //         },
  //         {
  //           model: Cab,
  //           as: 'cab',
  //           attributes: ['regNo', 'model', 'noOfSeats'],
  //           required: false,
  //         },
  //         {
  //           model: Organization,
  //           attributes: ['id', 'name', 'geoCode'],
  //         },
  //         {
  //           model: Security,
  //           as: 'security',
  //           attributes: ['id', 'name'],
  //           required: false, // added: needed for $security.name$ to stay an OUTER join, preserving original "match even if no security assigned" behavior
  //         },
  //         {
  //           model: TripRequest,
  //           as: 'employeeTripRequest',
  //           attributes: [
  //             'id',
  //             'employeeID',
  //             'employeeCode',
  //             'status',
  //             'emergencyType',
  //             'officeLocation',
  //           ],
  //         },
  //       ],
  //     };

  //     if (search) {
  //       const searchTerm = `%${search}%`;

  //       query.where = {
  //         ...query.where,
  //         [Op.or]: [
  //           // id cast — native operator instead of literal string interpolation
  //           where(cast(col('Trip.id'), 'text'), { [Op.iLike]: searchTerm }),

  //           { vendorCode: { [Op.iLike]: searchTerm } },
  //           { routeNumber: { [Op.iLike]: searchTerm } },
  //           { tripLocation: { [Op.iLike]: searchTerm } },
  //           { spockCode: { [Op.iLike]: searchTerm } },
  //           { estimatedDistance: { [Op.iLike]: searchTerm } },
  //           { plannedTime: { [Op.iLike]: searchTerm } },

  //           // associations instead of manually constructed EXISTS subqueries
  //           { '$driver.name$': { [Op.iLike]: searchTerm } },
  //           { '$security.name$': { [Op.iLike]: searchTerm } },
  //           { '$cab.regNo$': { [Op.iLike]: searchTerm } },

  //           // JSONB array search: no native Sequelize operator exists for
  //           // jsonb_array_elements, so raw SQL is genuinely unavoidable here.
  //           // Per the recommendation, this uses a bind parameter ($search)
  //           // instead of any string interpolation.
  //           literal(`
  //           EXISTS (
  //             SELECT 1 FROM jsonb_array_elements("Trip"."employees") AS emp
  //             WHERE emp->>'name' ILIKE $search
  //              OR emp->>'employeeCode' ILIKE $search
  //              OR emp->>'address' ILIKE $search
  //              OR emp->>'gender' ILIKE $search
  //              OR emp->>'cabArrivalTime' ILIKE $search
  //              OR emp->>'commuteDistance' ILIKE $search
  //              OR emp->>'location' ILIKE $search
  //           )
  //         `),
  //         ],
  //       };

  //       // bind parameter — Sequelize substitutes $search safely at the
  //       // driver level; the value can never alter query structure.
  //       query.bind = { search: searchTerm };
  //     }

  //     // Add pagination only if input was passed
  //     if (tripFilterInput && take !== undefined && skip !== undefined) {
  //       query.limit = take;
  //       query.offset = search ? 0 : skip * take;
  //     }

  //     const trip = await this.tripModel.findAndCountAll(query);
  //     trip.rows.reduce(
  //       (acc, trip) =>
  //         acc +
  //         (trip.employees?.length || trip.employeeTripRequest?.length || 0),
  //       0,
  //     );

  //     if (trip) {
  //       return {
  //         totalItems: trip.count,
  //         items: trip.rows,
  //       };
  //     } else {
  //       throw new NotFoundException('Invalid date and time');
  //     }
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  //using sequelize.query
  async findAllTripsByDate(
    shiftTime: string,
    date: string,
    user: any,
    pickDrop: boolean,
    tripFilterInput?: TripFilterInput,
    requestType?: string,
  ): Promise<PaginatedList<Trip>> {
    try {
      const { take, skip, search } = tripFilterInput || {};

      const baseWhere: any = {
        shiftTime,
        date,
        orgID: user.orgID,
        pickDrop: pickDrop ? PickDrop?.Pick : PickDrop?.Drop,
        status: { [Op.ne]: TripStatus.Cancelled },
        emergencyType: requestType
          ? requestType != 'null'
            ? requestType
            : null
          : null,
      };

      let matchingTripIds: number[] | null = null;

      if (search) {
        const searchTerm = `%${search}%`;

        // Raw parameterized query — only used to resolve which Trip IDs
        // match the free-text search (including the JSONB employees array,
        // which has no native Sequelize operator equivalent).
        const matches = await this.tripModel.sequelize.query<{ id: number }>(
          `
          SELECT DISTINCT "Trip"."id"
          FROM "Trips" AS "Trip"
          LEFT JOIN "Drivers" AS "driver" ON "driver"."id" = "Trip"."driverID"
          LEFT JOIN "Securities" AS "security" ON "security"."id" = "Trip"."spockID"
          LEFT JOIN "Cabs" AS "cab" ON "cab"."id" = "Trip"."cabID"
          WHERE
            CAST("Trip"."id" AS TEXT) ILIKE :search
            OR "Trip"."vendorCode" ILIKE :search
            OR "Trip"."routeNumber" ILIKE :search
            OR "Trip"."tripLocation" ILIKE :search
            OR "Trip"."spockCode" ILIKE :search
            OR "Trip"."estimatedDistance" ILIKE :search
            OR "Trip"."plannedTime" ILIKE :search
            OR "driver"."name" ILIKE :search
            OR "security"."name" ILIKE :search
            OR "cab"."regNo" ILIKE :search
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements("Trip"."employees") AS emp
              WHERE emp->>'name' ILIKE :search
               OR emp->>'employeeCode' ILIKE :search
               OR emp->>'address' ILIKE :search
               OR emp->>'gender' ILIKE :search
               OR emp->>'cabArrivalTime' ILIKE :search
               OR emp->>'commuteDistance' ILIKE :search
               OR emp->>'location' ILIKE :search
            )
        `,
          {
            replacements: { search: searchTerm },
            type: QueryTypes.SELECT,
          },
        );

        matchingTripIds = matches.map((row) => row.id);

        // No matches — short-circuit with an empty result rather than
        // querying further (and avoids Op.in: [] edge-case behavior).
        if (matchingTripIds.length === 0) {
          return { totalItems: 0, items: [] };
        }

        baseWhere.id = { [Op.in]: matchingTripIds };
      }

      const query: any = {
        where: baseWhere,
        order: [['routeNumber', 'ASC']],
        distinct: true,
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: ['name'],
            required: false,
          },
          {
            model: Cab,
            as: 'cab',
            attributes: ['regNo', 'model', 'noOfSeats'],
            required: false,
          },
          { model: Organization, attributes: ['id', 'name', 'geoCode'] },
          {
            model: Security,
            as: 'security',
            attributes: ['id', 'name'],
            required: false,
          },
          {
            model: TripRequest,
            as: 'employeeTripRequest',
            attributes: [
              'id',
              'employeeID',
              'employeeCode',
              'status',
              'emergencyType',
              'officeLocation',
            ],
          },
        ],
      };

      if (tripFilterInput && take !== undefined && skip !== undefined) {
        query.limit = take;
        query.offset = search ? 0 : skip * take;
      }

      const trip = await this.tripModel.findAndCountAll(query);
      trip.rows.reduce(
        (acc, trip) =>
          acc +
          (trip.employees?.length || trip.employeeTripRequest?.length || 0),
        0,
      );

      if (trip) {
        return {
          totalItems: trip.count,
          items: trip.rows,
        };
      } else {
        throw new NotFoundException('Invalid date and time');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllTripsByDateDashboard(
    user: any,
    shiftTime?: string,
    date?: string,
    pickDrop?: boolean,
    tripFilterInput?: TripFilterInput,
  ): Promise<PaginatedList<Trip>> {
    try {
      const { take, skip } = tripFilterInput || {}; // Handle undefined case
      const whereClause: any = {
        // date,
        orgID: user.orgID,
        pickDrop: pickDrop ? PickDrop?.Pick : PickDrop?.Drop,
        status: { [Op.ne]: TripStatus.Cancelled },
      };
      if (shiftTime && shiftTime !== 'undefined' && shiftTime !== 'null') {
        whereClause.shiftTime = shiftTime;
      }
      if (date && date !== 'undefined' && date !== 'null') {
        whereClause.date = date;
      }
      // Build the base query
      const query: any = {
        where: whereClause,
        order: [['routeNumber', 'ASC']],
        distinct: true,
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: ['name'],
          },
          {
            model: Cab,
            as: 'cab',
            // imei is additive: the Live Dashboard map needs it to decide which
            // pre-start trips are trackable by device before the trip begins.
            attributes: ['regNo', 'model', 'noOfSeats', 'imei'],
          },
          {
            model: Organization,
            attributes: ['id', 'name', 'geoCode'],
          },
          {
            model: Security,
            as: 'security',
            attributes: ['id', 'name'],
            include: [
              {
                model: SecurityAttendance,
                as: 'securityAttendance',
                attributes: [
                  'id',
                  'spockID',
                  'tripID',
                  'status',
                  'attendanceMarkedTime',
                  'createdAt',
                ],
              },
            ],
          },
          {
            model: TripRequest,
            as: 'employeeTripRequest',
            attributes: [
              'id',
              'employeeID',
              'employeeCode',
              'status',
              'emergencyType',
            ],
          },
        ],
      };

      // Add pagination only if input was passed
      if (tripFilterInput && take !== undefined && skip !== undefined) {
        query.limit = take;
        query.offset = skip * take;
      }

      const trip = await this.tripModel.findAndCountAll(query);
      trip.rows.reduce(
        (acc, trip) =>
          acc +
          (trip.employees?.length || trip.employeeTripRequest?.length || 0),
        0,
      );

      if (trip) {
        return {
          totalItems: trip.count,
          items: trip.rows,
        };
      } else {
        throw new NotFoundException('Invalid date and time');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllTripsCount(
    shiftTime: string,
    date: string,
    user: any,
    pickDrop: boolean,
    tripFilterInput?: TripFilterInput,
    requestType?: string,
  ): Promise<
    PaginatedList<Trip> & {
      employeeCount: any;
      spocCount: any;
      seatCount: any;
      vendorCount: any;
    }
  > {
    try {
      const {
        // take,
        // skip,
        // sortBy = 'id',
        // sortOrder = SortOrder.DESC,
        // filter,
        // orgID,
      } = tripFilterInput || {}; // Handle undefined case

      // Build the base query
      const query: any = {
        where: {
          shiftTime,
          date,
          orgID: user.orgID,
          pickDrop: pickDrop ? PickDrop?.Pick : PickDrop?.Drop,
          status: { [Op.ne]: TripStatus.Cancelled },
          emergencyType: requestType
            ? requestType != 'null'
              ? requestType
              : null
            : null,
        },
        order: [['routeNumber', 'ASC']],
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: ['name'],
          },
          {
            model: Cab,
            as: 'cab',
            attributes: ['regNo', 'model', 'noOfSeats'],
          },
          {
            model: Organization,
            attributes: ['id', 'name', 'geoCode'],
          },
          {
            model: Security,
            as: 'security',
            attributes: ['id', 'name'],
          },
          {
            model: TripRequest,
            as: 'employeeTripRequest',
            attributes: [
              'id',
              'employeeID',
              'employeeCode',
              'status',
              'emergencyType',
            ],
          },
        ],
      };

      // Add pagination only if input was passed
      // if (tripFilterInput && take !== undefined && skip !== undefined) {
      //   query.limit = take;
      //   query.offset = skip * take;
      // }

      const trip = await this.tripModel.findAndCountAll(query);

      const employeeCount = trip.rows.reduce(
        (acc, trip) => acc + (trip.employeeTripRequest?.length || 0),
        0,
      );

      // const spocCount = trip.rows.reduce(
      //   (acc, trip) => acc + (trip.spockID ? 1 : 0),
      //   0,
      // );

      const spocCount = trip.rows.reduce(
        (acc, trip) => acc + (trip.spock ? 1 : 0),
        0,
      );

      const vendorCount = new Set(
        trip.rows
          .map((trip) => trip.vendorID)
          .filter((vendorID) => vendorID !== null && vendorID !== undefined),
      ).size;

      const seatCount = {};
      trip.rows.forEach((trip) => {
        const seats = String(trip.seats ?? '0');
        seatCount[seats] = (seatCount[seats] || 0) + 1;
      });

      if (trip) {
        return {
          totalItems: trip.count,
          items: trip.rows,
          employeeCount,
          spocCount,
          vendorCount,
          seatCount,
        };
      } else {
        throw new NotFoundException('Invalid date and time');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllTripsListByDate(
    shiftTime: string,
    date: string,
    user: any,
    pickDrop: boolean,
  ): Promise<PaginatedList<Trip>> {
    try {
      const normalizedShiftTime = normalizeTimeFormat(shiftTime);
      const query: any = {
        where: {
          shiftTime: normalizedShiftTime,
          date,
          orgID: user.orgID,
          pickDrop: pickDrop ? PickDrop?.Pick : PickDrop?.Drop,
        },
        order: [['routeNumber', 'ASC']],
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: ['name'],
          },
          {
            model: Cab,
            as: 'cab',
            attributes: ['regNo', 'model'],
          },
          {
            model: Organization,
            attributes: ['id', 'name', 'geoCode'],
          },
          {
            model: Security,
            as: 'security',
            attributes: ['id', 'name'],
          },
        ],
      };
      const trip = await this.tripModel.findAndCountAll(query);

      if (trip) {
        return {
          totalItems: trip.count,
          items: trip.rows,
        };
      } else {
        throw new NotFoundException('Invalid date and time');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async findAllTripsListByDateForDownload(
    shiftTime: string,
    date: string,
    user: any,
    pickDrop: boolean,
    requestType?: string,
  ): Promise<PaginatedList<Trip>> {
    try {
      const query: any = {
        where: {
          shiftTime: shiftTime,
          date,
          orgID: user.orgID,
          pickDrop: pickDrop ? PickDrop?.Pick : PickDrop?.Drop,
          emergencyType: requestType
            ? requestType != 'null'
              ? requestType
              : null
            : null,
        },
        order: [['routeNumber', 'ASC']],
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: ['name'],
          },
          {
            model: Cab,
            as: 'cab',
            attributes: ['regNo', 'model'],
          },
          {
            model: Organization,
            attributes: ['id', 'name', 'geoCode'],
          },
          {
            model: Security,
            as: 'security',
            attributes: ['id', 'name'],
          },
        ],
      };
      const trip = await this.tripModel.findAndCountAll(query);

      if (trip) {
        return {
          totalItems: trip.count,
          items: trip.rows,
        };
      } else {
        throw new NotFoundException('Invalid date and time');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findTripStatusByemployees(
    shiftTime: any,
    date: any,
    user: any,
    pickDrop: string,
    employees: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const trips = await this.tripModel.findAndCountAll({
        where: {
          shiftTime,
          date,
          pickDrop: pickDrop,
        },
      });
      const updatedEmployees = employees?.map((emp) => {
        let foundLockStatus = null;
        let routeNumber = null;

        for (const trip of trips?.rows) {
          if (
            trip?.dataValues?.employees.some(
              (tripEmp) => tripEmp.id === emp.value,
            )
          ) {
            foundLockStatus = trip?.lockStatus;
            routeNumber = trip?.routeNumber;
            break;
          }
        }

        return {
          ...emp,
          lockStatus: foundLockStatus,
          routeNumber,
        };
      });
      return {
        totalItems: updatedEmployees?.count,
        items: updatedEmployees,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  //   async findAllShiftTimeByTrips(user?: any, date?: string) {
  //     try {
  //       const shiftTimes = await Trip.findAll({
  //         attributes: [
  //           'shiftTime',
  //           [Sequelize.fn('COUNT', Sequelize.col('id')), 'requestCount'],
  //           'pickDrop',
  //         ],
  //         where: { orgID: user.orgID, date: date },
  //         group: ['shiftTime', 'pickDrop'],
  //         raw: true,
  //       });
  //       return shiftTimes;
  //     } catch (error) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //       throw new InternalServerErrorException(error);
  //     }
  //   }

  // async update(
  //   updateTripInput: UpdateTripInput[],
  //   user: any,
  //   shiftTime: string,
  //   date: string,
  // ): Promise<any> {
  //   try {
  //     const updatedTrips = await Promise.all(
  //       updateTripInput.map(async (trip) => {
  //         const updatedTrip = await this.tripModel.update(
  //           { ...trip },
  //           {
  //             where: {
  //               shiftTime: shiftTime,
  //               date: date,
  //               id: trip?.id,
  //               orgID: user?.orgID,
  //             },
  //             returning: true,
  //           },
  //         );
  //         return updatedTrip?.[1]?.[0];
  //       }),
  //     );

  //     return {
  //       message: 'Trips updated successfully',
  //       data: updatedTrips,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  async findAllTripsByDateForVendor(
    shiftTime: string,
    date: string,
    user: any,
    pickDrop: string,
    orgID?: string,
    tripFilterInput?: TripFilterInput,
  ): Promise<PaginatedList<Trip>> {
    try {
      const {
        take,
        skip,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
      } = tripFilterInput || {};
      const whereCondition: any = {
        shiftTime,
        date,
        vendorID: user?.vendorID,
        orgID: orgID,
        pickDrop,
        status: { [Op.ne]: TripStatus.Cancelled },
      };
      const trip = await this.tripModel.findAndCountAll({
        where: whereCondition,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        distinct: true,
        include: [
          {
            model: Driver,
            as: 'driver',
          },
          {
            model: Cab,
            as: 'cab',
          },
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name', 'geoCode'], // include only required fields
          },
          {
            model: TripRequest,
            as: 'employeeTripRequest',
            attributes: [
              'id',
              'employeeID',
              'employeeCode',
              'status',
              'emergencyType',
            ],
          },
        ],
      });
      if (trip)
        return {
          totalItems: trip.count,
          items: trip.rows,
        };
      else throw new NotFoundException('Invalid date and time');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllTripsByDateForVendorLive(
    shiftTime: string,
    date: string,
    pickDrop: string,
    user: any,
    orgID?: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const whereCondition: any = {
        shiftTime,
        date,
        pickDrop,
        vendorID: user?.vendorID,
        status: { [Op.ne]: TripStatus.Cancelled },
      };

      if (orgID) {
        whereCondition.orgID = orgID;
      }
      const trip = await this.tripModel.findAndCountAll({
        where: whereCondition,
        distinct: true,
        include: [
          {
            model: Driver,
            as: 'driver',
          },
          {
            model: Cab,
            as: 'cab',
          },
          {
            model: TripRequest,
            as: 'employeeTripRequest',
            attributes: [
              'id',
              'employeeID',
              'employeeCode',
              'status',
              'emergencyType',
            ],
          },
        ],
      });
      if (trip)
        return {
          totalItems: trip.count,
          items: trip.rows,
        };
      else throw new NotFoundException('Invalid date and time');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllTripByShiftTime(
    user?: any,
    shiftDate?: string,
    shiftTime?: string,
    pickDrop?: string,
    orgID?: string,
  ) {
    try {
      const trips = await this.tripModel.findAndCountAll({
        where: {
          shiftTime: shiftTime,
          date: shiftDate,
          pickDrop: pickDrop,
          orgID: orgID,
          vendorID: user?.vendorID,
        },
        // order: [[sortBy, sortOrder]],
        // limit: take,
        // offset: skip * take,
        attributes: [
          'id',
          'vendorID',
          'vendorCode',
          'date',
          'shiftTime',
          'pickDrop',
          'employees',
          'tripLocation',
        ],
        include: [
          // {
          //   model: Employee,
          //   as: 'employee',
          //   attributes: [
          //     'id',
          //     'name',
          //     'gender',
          //     'phone',
          //     'homePoint',
          //     'landmark',
          //     'address',
          //     'locationID',
          //   ],
          // },
          // {
          //   model: Location,
          //   as: 'location',
          //   attributes: ['id', 'name'],
          // },
        ],
      });
      // const formattedData = trips.rows.map((trip) => ({
      //   tripRequestID: trip?.id,
      //   tripID: trip?.tripID,
      //   id: trip?.employee?.id,
      //   empCode: trip?.employeeCode,
      //   name: trip?.employee?.name,
      //   gender: trip?.employee?.gender?.toLowerCase(),
      //   location: trip?.location?.name,
      //   address: trip?.employee?.address,
      //   landmark: trip?.employee?.landmark,
      //   employee: trip?.employee,
      //   locationID: trip?.employee?.locationID,
      //   pickUpTime: trip?.pickUpTime,
      // }));

      if (trips)
        return {
          totalItems: trips.count,
          items: trips.rows,
        };
      else throw new NotFoundException('Invalid date and time');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async findAllShiftTimeByTrips(user?: any, date?: string, orgID?: string) {
    try {
      const shiftTimes = await Trip.findAll({
        attributes: [
          [col('Trip.shiftTime'), 'shiftTime'],
          [
            fn(
              'COUNT',
              fn(
                'DISTINCT',
                literal(
                  `CASE WHEN "Trip"."status" NOT IN ('Cancelled') THEN "Trip"."id" END`,
                ),
              ),
            ),
            'tripCount',
          ],
          [col('Trip.pickDrop'), 'pickDrop'],
          [
            fn('ARRAY_AGG', col('tripEmployees.emergencyType')),
            'emergencyTypes',
          ],
        ],
        where: {
          orgID: orgID,
          date: date,
          vendorID: user.vendorID,
        },
        include: [
          {
            model: TripRequest,
            as: 'tripEmployees',
            attributes: [],
          },
        ],
        group: ['Trip.shiftTime', 'Trip.pickDrop'],
        raw: true,
      });
      return shiftTimes;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // --- helper: fetch driver(s) + trip context and dispatch notifications ---
  private async notifyDriversOfAssignment(
    tripIDs: (string | number | bigint)[],
  ): Promise<void> {
    const uniqueTripIDs = [...new Set(tripIDs.filter((id) => isPresent(id)))];
    if (uniqueTripIDs.length === 0) return;

    try {
      const trips = await this.tripModel.findAll({
        where: { id: { [Op.in]: uniqueTripIDs } },
        include: [
          { model: Organization, as: 'org' },
          { model: Vendor, as: 'vendor' },
          {
            model: Driver,
            as: 'driver',
            include: [{ model: DriverDeviceInfo, as: 'driverDeviceInfo' }],
          },
        ],
      });

      for (const trip of trips) {
        const driver = trip.driver;
        if (!driver) continue;

        const deviceInfo = (driver.driverDeviceInfo || [])
          .slice()
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )[0];

        const payload = {
          organizationId: String(trip.orgID),
          event: 'driver.assignment.alert',
          locale: 'en',
          queue: false,
          recipient: {
            id: String(driver.id),
            email: driver.email,
            name: driver.name,
            phoneNumber: `91${driver.phone}`,
            deviceToken: deviceInfo?.deviceToken,
          },
          channels: [NotificationChannel.PUSH, NotificationChannel.SMS],
          data: {
            tripID: String(trip.id),
            route: trip.routeNumber,
            date: moment(trip.date, 'YYYY-MM-DD').format('DD/MM/YYYY'),
            time: trip.shiftTime,
            tripType: trip.pickDrop,
            orgName: trip.org?.name,
            vendorName: trip.vendor?.name,
          },
          tripID: String(trip.id),
          driverID: String(driver.id),
        };

        this.notificationDispatcher
          .notify(payload)
          .catch((err) =>
            this.logger.error(
              `Driver notification failed for driver ${driver.id}, trip ${trip.id}`,
              err,
            ),
          );
      }
    } catch (err) {
      this.logger.error('Failed to notify drivers of assignment', err);
    }
  }

  async assignCabAndDriver(
    assignmentInput: any,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    const transaction = await this.sequelize.transaction();
    try {
      const { tripID, cabID, driverID, vendorID, vendorCode } = assignmentInput;

      // Validate trip exists
      const existingTrip = await this.tripModel.findOne({
        where: { id: tripID, orgID: user?.orgID },
      });

      if (!existingTrip) {
        throw new NotFoundException('Trip not found');
      }

      // Simple update - just cab and driver assignment
      const [, updatedRows] = await this.tripModel.update(
        {
          cabID: cabID || null,
          driverID: driverID || null,
          vendorID: vendorID || null,
          vendorCode: vendorCode || null,
        },
        {
          where: { id: tripID, orgID: user?.orgID },
          returning: true,
          transaction,
        },
      );

      // Create event log
      const eventLog = {
        objectType: 'Trip',
        changeType: 'edit',
        objectID: tripID,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: updatedRows[0],
        requestPayload: assignmentInput,
        customDescription: 'Cab and driver assigned',
        user,
      };
      await this.eventlogService.create(eventLog);

      await transaction.commit();
      // Fire-and-forget: notify the driver after commit succeeds
      if (driverID) {
        this.notifyDriversOfAssignment([tripID]).catch((err) =>
          this.logger.error('Driver notify failed', err),
        );
      }

      return {
        message: 'Cab and driver assigned successfully',
        data: updatedRows[0],
      };
    } catch (error) {
      await transaction.rollback();

      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to assign cab and driver');
    }
  }

  async bulkAssignCabAndDriver(
    bulkAssignmentInput: BulkAssignCabDriverDto,
    user: any,
  ): Promise<GenericResponse<Trip[]>> {
    const transaction = await this.sequelize.transaction();
    try {
      const { assignments } = bulkAssignmentInput;
      const updatedTrips: Trip[] = [];
      const tripIDs = assignments.map((a) => a.tripID);

      const existingTrips = await this.tripModel.findAll({
        where: { id: { [Op.in]: tripIDs }, orgID: user?.orgID },
        transaction,
      });

      if (existingTrips.length !== assignments.length) {
        throw new NotFoundException('One or more trips not found');
      }

      const existingTripsMap = new Map(
        existingTrips.map((trip) => [String(trip.id), trip]),
      );
      const updatedTripsMap = new Map<string, Trip>();

      for (const assignment of assignments) {
        const { tripID, cabID, driverID, vendorID, vendorCode } = assignment;

        const [, updatedRows] = await this.tripModel.update(
          {
            cabID: cabID || null,
            driverID: driverID || null,
            vendorID: vendorID || null,
            vendorCode: vendorCode || null,
          },
          {
            where: { id: tripID, orgID: user?.orgID },
            returning: true,
            transaction,
          },
        );

        if (updatedRows[0]) {
          updatedTrips.push(updatedRows[0]);
          updatedTripsMap.set(String(tripID), updatedRows[0]);
        }
      }

      await transaction.commit();

      // Resolve human-readable cab/driver labels for the event log.
      // Sequelize's UPDATE...RETURNING can't eager-load associations, so
      // the new cabID/driverID values come straight from `assignments`
      // (we already know them — no extra query needed for those), and
      // both old + new IDs across the whole batch are collected once here
      // for exactly two lookups total, not one per trip.
      const allCabIDs = new Set<string>();
      const allDriverIDs = new Set<string>();
      for (const trip of existingTrips) {
        if (trip.cabID) allCabIDs.add(String(trip.cabID));
        if (trip.driverID) allDriverIDs.add(String(trip.driverID));
      }
      for (const assignment of assignments) {
        if (assignment.cabID) allCabIDs.add(String(assignment.cabID));
        if (assignment.driverID) allDriverIDs.add(String(assignment.driverID));
      }

      const [cabs, drivers] = await Promise.all([
        allCabIDs.size
          ? this.cabModel.findAll({
              where: { id: { [Op.in]: Array.from(allCabIDs) } },
              attributes: ['id', 'regNo'],
            })
          : [],
        allDriverIDs.size
          ? this.driverModel.findAll({
              where: { id: { [Op.in]: Array.from(allDriverIDs) } },
              attributes: ['id', 'name', 'code'],
            })
          : [],
      ]);

      const cabLabelMap = new Map(
        cabs.map((cab): [string, string] => [
          String(cab.id),
          cab.regNo ?? String(cab.id),
        ]),
      );
      const driverLabelMap = new Map(
        drivers.map((driver): [string, string] => [
          String(driver.id),
          driver.code
            ? `${driver.name} - ${driver.code}`
            : driver.name ?? String(driver.id),
        ]),
      );

      // Falls back to the raw ID if a cab/driver was deleted since (both
      // models are paranoid, so a soft-deleted row silently drops out of
      // the findAll above) — never worse than showing nothing.
      const resolveCabLabel = (cabID: any): string | null =>
        cabID ? cabLabelMap.get(String(cabID)) ?? String(cabID) : null;
      const resolveDriverLabel = (driverID: any): string | null =>
        driverID
          ? driverLabelMap.get(String(driverID)) ?? String(driverID)
          : null;

      // Per-trip Old/New diff (cab + driver) plus a flat summary payload,
      // correlated strictly by tripID via the maps above — never by array
      // position (updatedTrips can end up shorter than assignments; see
      // the `if (updatedRows[0])` guard above).
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      const payloadSummary: any[] = [];
      let anyAssigned = false;
      let anyUnassigned = false;

      for (const assignment of assignments) {
        const tripIDStr = String(assignment.tripID);
        const existingTrip = existingTripsMap.get(tripIDStr);
        const updatedTrip = updatedTripsMap.get(tripIDStr) ?? existingTrip;

        const cabOld = existingTrip?.cabID ? String(existingTrip.cabID) : null;
        const cabNew = updatedTrip?.cabID ? String(updatedTrip.cabID) : null;
        const driverOld = existingTrip?.driverID
          ? String(existingTrip.driverID)
          : null;
        const driverNew = updatedTrip?.driverID
          ? String(updatedTrip.driverID)
          : null;

        // Classified off the actual before/after state, not off which DTO
        // fields were present in the request — cabID often arrives resent
        // unchanged alongside a driver-only unassignment, and counting a
        // resent-but-identical value as an "assignment" mislabeled the
        // whole batch.
        if (cabOld !== cabNew) {
          if (!cabOld) anyAssigned = true;
          else if (!cabNew) anyUnassigned = true;
          else anyAssigned = true; // reassigned to a different cab
        }
        if (driverOld !== driverNew) {
          if (!driverOld) anyAssigned = true;
          else if (!driverNew) anyUnassigned = true;
          else anyAssigned = true; // reassigned to a different driver
        }

        changeJSON[`Trip ${tripIDStr} - Cab`] = {
          OldValue: resolveCabLabel(existingTrip?.cabID),
          newValue: resolveCabLabel(updatedTrip?.cabID),
        };
        changeJSON[`Trip ${tripIDStr} - Driver`] = {
          OldValue: resolveDriverLabel(existingTrip?.driverID),
          newValue: resolveDriverLabel(updatedTrip?.driverID),
        };

        payloadSummary.push({
          tripID: tripIDStr,
          previousCab: resolveCabLabel(existingTrip?.cabID),
          currentCab: resolveCabLabel(updatedTrip?.cabID),
          previousDriver: resolveDriverLabel(existingTrip?.driverID),
          currentDriver: resolveDriverLabel(updatedTrip?.driverID),
        });
      }

      let actionLabel: string;
      if (anyAssigned && anyUnassigned) {
        actionLabel = 'assignment/unassignment';
      } else if (anyUnassigned) {
        actionLabel = 'unassignment';
      } else if (anyAssigned) {
        actionLabel = 'assignment';
      } else {
        // Nothing actually changed (e.g. re-saving identical cab/driver
        // values) — a neutral label instead of falsely implying an
        // assignment happened.
        actionLabel = 'update';
      }

      const eventLog = {
        objectType: 'Trip',
        changeType: 'bulk_edit',
        // objectID is a single BIGINT column — can't hold a comma-joined
        // list once more than one trip is in the batch. null for a
        // multi-object bulk action (same convention as trip-request
        // failure logs with no single record); keep the real ID when
        // there's exactly one trip, since that's still meaningful.
        objectID: tripIDs.length === 1 ? tripIDs[0] : null,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: payloadSummary,
        requestPayload: bulkAssignmentInput,
        changeJSON,
        customDescription: `Bulk cab and driver ${actionLabel} for ${assignments.length} trips`,
        user,
      };
      this.eventlogService
        .create(eventLog)
        .catch((err) => this.logger.error('Event log failed', err));

      const driverAssignedTripIDs = assignments
        .filter((a) => a.driverID)
        .map((a) => a.tripID);
      this.notifyDriversOfAssignment(driverAssignedTripIDs).catch((err) =>
        this.logger.error('Bulk driver notify failed', err),
      );
      return {
        message: `Successfully updated cabs and drivers to ${updatedTrips.length} trips`,
        data: updatedTrips,
      };
    } catch (error) {
      await transaction.rollback();

      if (error.status !== 500) throw error;

      throw new InternalServerErrorException(
        'Failed to bulk assign cabs and drivers',
      );
    }
  }

  // async update(
  //   updateTripInput: UpdateTripInput,
  //   user: any,
  //   shiftTime: string,
  //   date: string,
  // ): Promise<any> {
  //   const transaction = await this.sequelize.transaction();
  //   try {
  //     if (
  //       updateTripInput?.removedTrips?.length &&
  //       updateTripInput?.removedTrips !== null
  //     ) {
  //       // await Promise.all(
  //       //   updateTripInput?.removedTrips?.map(async (tripID) => {
  //       //     await this.tripModel.destroy({
  //       //       where: { id: tripID },
  //       //       transaction,
  //       //     });
  //       //     await this.tripRequestModel.update(
  //       //       { tripID: null },
  //       //       {
  //       //         where: { tripID: tripID },
  //       //         transaction,
  //       //       },
  //       //     );
  //       //   }),
  //       // );
  //       // BULK DESTROY + BULK UPDATE instead of looping
  //       await this.tripModel.destroy({
  //         where: { id: { [Op.in]: updateTripInput.removedTrips } },
  //         transaction,
  //       });
  //       await this.tripRequestModel.update(
  //         { tripID: null },
  //         {
  //           where: { tripID: { [Op.in]: updateTripInput.removedTrips } },
  //           transaction,
  //         },
  //       );
  //     }
  //     const organization = await this.organizationService.findOne(user?.orgID);
  //     // ✅ Fetch ALL configs ONCE, before processing any trips
  //     const bufferConfig =
  //       await this.configurationService.getMultipleConfigValues(
  //         ['Cab waiting time', 'Pick Buffer', 'Drop Buffer'],
  //         { orgID: user.orgID },
  //       );
  //     const {
  //       'Cab waiting time': cabWaitingTimeBuffer,
  //       'Pick Buffer': rawPickBuffer,
  //       'Drop Buffer': rawDropBuffer,
  //     } = bufferConfig?.data || {};

  //     // ✅ Parse ONCE
  //     const parsedPickBuffer = parseBufferConfig(rawPickBuffer);
  //     const parsedDropBuffer = parseBufferConfig(rawDropBuffer);

  //     const updatedTrips = await Promise.all(
  //       updateTripInput?.updatedTrips?.map(async (trip) => {
  //         const formattedEmployees = trip?.employees?.map((employee) => ({
  //           id: employee?.id,
  //           name: employee.name,
  //           gender: employee.gender,
  //           address: employee.address,
  //           empCode: employee.empCode,
  //           landmark: employee.landmark,
  //           location: employee.location,
  //           tripRequestID: employee?.tripRequestID,
  //           homepoint: employee?.employee?.homePoint || employee?.homepoint,
  //           commuteDistance:
  //             employee?.employee?.commuteDistance || employee?.commuteDistance,
  //           noShow: employee.noShow,
  //           deboard: employee?.deboard ?? false,
  //           attendance: employee.attendance ?? false,
  //           specialConsideration:
  //             employee.specialConsideration ||
  //             employee.employee?.specialConsideration,
  //         }));

  //         let origin, destination, waypoints;

  //         if (trip.pickDrop === 'Pick') {
  //           origin = formattedEmployees[0]?.homepoint;
  //           waypoints = formattedEmployees
  //             ?.slice(1)
  //             .map((emp) => emp.homepoint)
  //             .filter((point) => point);
  //           destination = organization?.data?.geoCode;
  //         } else {
  //           origin = organization?.data?.geoCode;
  //           waypoints = formattedEmployees
  //             ?.slice(0, formattedEmployees?.length - 1)
  //             .map((emp) => emp.homepoint);
  //           destination =
  //             formattedEmployees[formattedEmployees?.length - 1]?.homepoint;
  //         }

  //         if (trip?.id) {
  //           // 🆕 GET EXISTING TRIP DATA TO PRESERVE VENDOR/CAB/DRIVER
  //           const existingTrip = await this.tripModel.findByPk(trip.id);

  //           // 🔍 ADD CONSOLE TO SEE WHAT WE'RE PRESERVING
  //           // console.log("📋 BACKEND - Existing trip data:", {
  //           //   routeNumber: existingTrip?.routeNumber,
  //           //   vendorID: existingTrip?.vendorID,
  //           //   vendorCode: existingTrip?.vendorCode,
  //           //   cabID: existingTrip?.cabID,
  //           //   driverID: existingTrip?.driverID,
  //           //   spockID: existingTrip?.spockID
  //           // });

  //           // console.log("📥 BACKEND - Incoming trip data:", {
  //           //   routeNumber: trip?.routeNumber,
  //           //   vendorID: trip?.vendorID,
  //           //   vendorCode: trip?.vendorCode,
  //           //   cabID: trip?.cabID,
  //           //   driverID: trip?.driverID,
  //           //   spockID: trip?.spockID
  //           // });

  //           const cabRouteResponse =
  //             await this.googleMapService.calculateCabRoute(
  //               origin,
  //               destination,
  //               waypoints,
  //             );

  //           // Distance-based buffer lookup
  //           const totalDistanceKm = cabRouteResponse?.totalDistanceKm ?? 0;

  //           const bufferMinutes = getBufferForDistance(
  //             trip.pickDrop === 'Pick' ? parsedPickBuffer : parsedDropBuffer,
  //             totalDistanceKm,
  //           );
  //           const arrivalTimeBuffer =
  //             trip.pickDrop === 'Pick' ? bufferMinutes : 0;
  //           const dropTimeBuffer = trip.pickDrop === 'Drop' ? bufferMinutes : 0;

  //           const employeesWithEstTime =
  //             await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
  //               trip.pickDrop,
  //               shiftTime,
  //               cabRouteResponse?.legs,
  //               formattedEmployees,
  //               String(arrivalTimeBuffer),
  //               String(dropTimeBuffer),
  //               String(cabWaitingTimeBuffer),
  //             );

  //           // 🆕 PRESERVE EXISTING VALUES WHEN INCOMING DATA IS NULL
  //           const preservedVendorData = {
  //             vendorID:
  //               trip?.vendorID !== null
  //                 ? trip?.vendorID
  //                 : existingTrip?.vendorID,
  //             vendorCode:
  //               trip?.vendorCode !== null
  //                 ? trip?.vendorCode
  //                 : existingTrip?.vendorCode,
  //             cabID: trip?.cabID !== null ? trip?.cabID : existingTrip?.cabID,
  //             driverID:
  //               trip?.driverID !== null
  //                 ? trip?.driverID
  //                 : existingTrip?.driverID,
  //             spockID:
  //               trip?.spockID !== null ? trip?.spockID : existingTrip?.spockID,
  //             spockCode:
  //               trip?.spockCode !== null
  //                 ? trip?.spockCode
  //                 : existingTrip?.spockCode,
  //             toll: trip?.toll !== undefined ? trip?.toll : existingTrip?.toll,
  //           };

  //           // 🔍 ADD CONSOLE TO SEE FINAL DATA BEING SAVED
  //           // console.log("💾 BACKEND - Final data being saved:", {
  //           //   routeNumber: trip?.routeNumber,
  //           //   ...preservedVendorData
  //           // });

  //           const updatedTrip = await this.tripModel.update(
  //             {
  //               ...trip,
  //               employees: employeesWithEstTime,
  //               // ✅ USE PRESERVED DATA INSTEAD OF POTENTIALLY NULL VALUES
  //               ...preservedVendorData,
  //               estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
  //               routeLegs: cabRouteResponse?.legs,
  //               emergencyType:
  //                 trip.emergencyType == 'null' ? null : trip.emergencyType,
  //             },
  //             {
  //               where: {
  //                 ...(shiftTime ? { shiftTime } : {}),
  //                 ...(date ? { date } : {}),
  //                 id: trip?.id,
  //                 orgID: user?.orgID ? user.orgID : trip.orgID,
  //               },
  //               returning: true,
  //               transaction,
  //             },
  //           );

  //           if (trip?.employees?.length) {
  //             // await Promise.all(
  //             //   trip.employees.map(async (employee) => {
  //             //     await this.tripRequestModel.update(
  //             //       {
  //             //         tripID: trip?.id,
  //             //       },
  //             //       {
  //             //         where: { id: employee?.tripRequestID },
  //             //         transaction,
  //             //         returning: true,
  //             //       },
  //             //     );
  //             //   }),
  //             // );
  //             const tripRequestIds = trip.employees
  //               .map((employee) => employee?.tripRequestID)
  //               .filter(Boolean);

  //             await this.tripRequestModel.update(
  //               { tripID: trip.id },
  //               {
  //                 where: { id: { [Op.in]: tripRequestIds } },
  //                 transaction,
  //               },
  //             );
  //           }
  //           return updatedTrip?.[1]?.[0];
  //         } else {
  //           // For new trips, use the data as provided
  //           const cabRouteResponse =
  //             await this.googleMapService.calculateCabRoute(
  //               origin,
  //               destination,
  //               waypoints,
  //             );

  //           // Distance-based buffer lookup
  //           const totalDistanceKmNew = cabRouteResponse?.totalDistanceKm ?? 0;
  //           const bufferMinutesNew = getBufferForDistance(
  //             trip.pickDrop === 'Pick' ? parsedPickBuffer : parsedDropBuffer,
  //             totalDistanceKmNew,
  //           );

  //           const arrivalTimeBufferNew =
  //             trip.pickDrop === 'Pick' ? bufferMinutesNew : 0;

  //           const dropTimeBufferNew =
  //             trip.pickDrop === 'Drop' ? bufferMinutesNew : 0;

  //           const employeesWithEstTime =
  //             await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
  //               trip.pickDrop,
  //               shiftTime,
  //               cabRouteResponse?.legs,
  //               formattedEmployees,
  //               String(arrivalTimeBufferNew),
  //               String(dropTimeBufferNew),
  //               String(cabWaitingTimeBuffer),
  //             );

  //           const newTrip = await this.tripModel.create(
  //             {
  //               ...trip,
  //               employees: employeesWithEstTime,
  //               orgID: user?.orgID,
  //               shiftTime: shiftTime,
  //               date: date,
  //               estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
  //               routeLegs: cabRouteResponse?.legs,
  //             },
  //             { transaction },
  //           );

  //           if (trip?.employees?.length) {
  //             // await Promise.all(
  //             //   trip.employees.map(async (employee) => {
  //             //     await this.tripRequestModel.update(
  //             //       {
  //             //         tripID: newTrip?.id,
  //             //       },
  //             //       {
  //             //         where: { id: employee.tripRequestID },
  //             //         transaction,
  //             //         returning: true,
  //             //       },
  //             //     );
  //             //   }),
  //             // );
  //             const tripRequestIds = trip.employees
  //               .map((employee) => employee?.tripRequestID)
  //               .filter(Boolean);

  //             await this.tripRequestModel.update(
  //               { tripID: newTrip.id },
  //               {
  //                 where: { id: { [Op.in]: tripRequestIds } },
  //                 transaction,
  //               },
  //             );
  //           }
  //           return newTrip;
  //         }
  //       }),
  //     );
  //     await transaction.commit();
  //     return {
  //       message: 'Trips updated successfully',
  //       data: updatedTrips,
  //     };
  //   } catch (error) {
  //     await transaction.rollback();
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async assignVendor(
    updateTripInput: UpdateTripInput,
    user: any,
    shiftTime: string,
    date: string,
  ): Promise<any> {
    try {
      // Collected during the update loop below — existingTrip (the
      // pre-update snapshot) is only in scope inside the map callback,
      // so this is the only point where "previous vendor" is available
      // to build an Old/New diff from afterward. vendorCode kept as a
      // fallback label in case a vendorID can't be resolved to a name
      // below (e.g. a since-deleted vendor).
      const vendorChanges: {
        tripID: string;
        previousVendorID: string | null;
        newVendorID: string | null;
        previousVendorCode: string | null;
        newVendorCode: string | null;
      }[] = [];
      const updatedTrips = await Promise.all(
        updateTripInput?.updatedTrips?.map(async (trip) => {
          if (trip?.id) {
            const existingTrip = await this.tripModel.findOne({
              where: {
                id: trip.id,
                orgID: user?.orgID ? user.orgID : trip.orgID,
              },
            });
            if (existingTrip.lockStatus !== 'Active') {
              throw new BadRequestException(
                `Lock the trips before assigning vendor`,
              );
            }
            // If vendor is changed, reset cab & driver
            let cabID = trip.cabID;
            let driverID = trip.driverID;
            if (
              existingTrip.vendorID &&
              existingTrip.vendorID.toString() !== trip.vendorID
            ) {
              cabID = null;
              driverID = null;
            }
            vendorChanges.push({
              tripID: String(trip.id),
              previousVendorID: existingTrip.vendorID
                ? String(existingTrip.vendorID)
                : null,
              newVendorID: trip.vendorID ? String(trip.vendorID) : null,
              previousVendorCode: existingTrip.vendorCode ?? null,
              newVendorCode: trip.vendorCode ?? null,
            });
            const updatedTrip = await this.tripModel.update(
              {
                ...trip,
                vendorID: trip.vendorID,
                vendorCode: trip.vendorCode,
                cabID,
                driverID,
              },
              {
                where: {
                  ...(shiftTime ? { shiftTime } : {}),
                  ...(date ? { date } : {}),
                  id: trip?.id,
                  orgID: user?.orgID ? user.orgID : trip.orgID,
                },
                returning: true,
              },
            );
            if (trip?.employees?.length) {
              const employeeTripRequestIds = trip.employees
                .map((emp) => emp?.tripRequestID)
                .filter(Boolean);
              if (employeeTripRequestIds.length) {
                await this.tripRequestModel.update(
                  {
                    tripID: trip?.id,
                  },
                  {
                    where: {
                      id: {
                        [Op.in]: employeeTripRequestIds,
                      },
                    },
                  },
                );
              }
            }
            return updatedTrip?.[1]?.[0]; // Return updated trip
          }
        }),
      );

      // One bulk lookup for every vendor touched (old + new) across the
      // whole batch, resolved to names for the log — was previously
      // showing vendorCode, not the actual vendor name.
      const allVendorIDs = new Set<string>();
      for (const change of vendorChanges) {
        if (change.previousVendorID) allVendorIDs.add(change.previousVendorID);
        if (change.newVendorID) allVendorIDs.add(change.newVendorID);
      }
      const vendors = allVendorIDs.size
        ? await this.vendorModel.findAll({
            where: { id: { [Op.in]: Array.from(allVendorIDs) } },
            attributes: ['id', 'name'],
          })
        : [];
      const vendorNameMap = new Map(
        vendors.map((v): [string, string] => [String(v.id), v.name]),
      );
      // Falls back to the raw vendorCode if a vendorID can't be resolved
      // (e.g. a since-deleted vendor) — never worse than showing nothing.
      const resolveVendorLabel = (
        vendorID: string | null,
        vendorCode: string | null,
      ): string | null => {
        if (vendorID) return vendorNameMap.get(vendorID) ?? vendorCode;
        return vendorCode;
      };

      // Diff table: one row per trip, previous vendor -> newly assigned
      // vendor. objectID stays null once more than one trip is touched —
      // it's a single BIGINT column, same reasoning as the bulk
      // cab/driver assignment fix elsewhere in this codebase.
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      const vendorChangesForLog = vendorChanges.map((change) => ({
        tripID: change.tripID,
        previousVendor: resolveVendorLabel(
          change.previousVendorID,
          change.previousVendorCode,
        ),
        newVendor: resolveVendorLabel(change.newVendorID, change.newVendorCode),
      }));
      for (const change of vendorChangesForLog) {
        changeJSON[`Trip ${change.tripID} - Vendor`] = {
          OldValue: change.previousVendor,
          newValue: change.newVendor,
        };
      }
      const eventLog = {
        objectType: 'Trip',
        changeType: 'bulk_edit',
        objectID: vendorChanges.length === 1 ? vendorChanges[0].tripID : null,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: vendorChangesForLog,
        requestPayload: { updateTripInput, shiftTime, date },
        changeJSON,
        customDescription: `assigned vendor for ${vendorChanges.length} trip(s)`,
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: 'Trips updated successfully',
        data: updatedTrips,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async updateEmployeeTrip(updateTripInput: any, user: any): Promise<any> {
    try {
      const { updatedTrips } = updateTripInput || {};
      const {
        id,
        empId,
        shiftTime,
        date,
        pickDrop,
        spockID,
        spockCode,
        spock,
        estimatedOccupancy,
        emergencyType,
      } = updatedTrips || {};
      const employeeDetails = await this.employeeModel.findOne({
        where: { id: empId },
        include: [
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
        ],
      });
      const cabWaitingTimeConfigEmp =
        await this.configurationService.getMultipleConfigValues(
          ['Cab waiting time'],
          { orgID: user.orgID },
        );
      const { 'Cab waiting time': cabWaitingTimeBuffer } =
        cabWaitingTimeConfigEmp?.data || {};

      const organization = await this.organizationService.findOne(user?.orgID);

      if ((empId === null && spockID) || (empId === null && pickDrop)) {
        // check if spock is in any ongoing trip
        if (spockID) {
          const ongoingSpockTrip = await this.tripModel.findOne({
            where: {
              spockID: spockID,
              status: 'Ongoing',
              orgID: user.orgID,
            },
          });

          if (ongoingSpockTrip) {
            throw new BadRequestException(
              `Spock (${spockCode}) is already assigned to an ongoing trip.`,
            );
          }
        }
        //Update spock on trip
        const updatedTrip = await this.tripModel.update(
          {
            spockID: spockID,
            spockCode: spockCode,
            spock: spock,
            estimatedOccupancy: estimatedOccupancy,
          },
          { where: { id: id }, returning: true },
        );
        return {
          message: 'Trips updated successfully',
          data: updatedTrip,
        };
      } else {
        const isTripRequestExist =
          await this.tripRequestService.findAllTripRequestsForEdit(
            user,
            date,
            shiftTime,
            pickDrop === PickDrop.Pick ? true : false,
            empId,
          );
        if (isTripRequestExist?.totalItems != 0) {
          //If an employee already exist on a trip, then reassign to another trip

          if (isTripRequestExist?.items?.[0]?.trip?.id != undefined) {
            //   await this.tripRequestModel.update(
            //     { tripID: id },
            //     {
            //       where: { id: isTripRequestExist?.items?.[0]?.tripRequestID },
            //       returning: true,
            //     },
            //   );
            const transaction = await this.sequelize.transaction(); // Start transaction
            try {
              const tripToBeAdded = await this.tripModel.findOne({
                where: { id: id },
                transaction,
              });
              //   console.log('tripToBeAdded---', tripToBeAdded);
              const existingEmployees = Array.isArray(tripToBeAdded?.employees)
                ? tripToBeAdded.employees
                : [];
              //   console.log('existingEmployees---', existingEmployees);

              const employeeData = {
                id: employeeDetails?.id,
                empCode: employeeDetails?.employeeCode,
                name: employeeDetails?.name,
                location: employeeDetails?.location?.name,
                address: employeeDetails?.address,
                landmark: employeeDetails?.landmark,
                homepoint: employeeDetails?.homePoint,
                commuteDistance: employeeDetails?.commuteDistance,
                gender: employeeDetails?.gender,
                tripRequestID: isTripRequestExist?.items?.[0]?.tripRequestID,
                noShow: isTripRequestExist?.items?.[0]?.noShow,
                deboard: isTripRequestExist?.items?.[0]?.deboard ?? false,
                attendance: isTripRequestExist?.items?.[0]?.attendance ?? false,
                specialConsideration: employeeDetails?.specialConsideration, // ← Add this line
              };

              const updatedEmployees = existingEmployees.some(
                (emp) => String(emp.id) === String(employeeData.id),
              )
                ? existingEmployees
                : [...existingEmployees, employeeData];

              //Calculate distance, time & legs
              let origin, destination, waypoints;
              //   console.log('updatedEmployees---', updatedEmployees);

              if (pickDrop === 'Pick') {
                origin = updatedEmployees[0]?.homepoint; // First employee
                waypoints = updatedEmployees
                  .slice(1)
                  .map((emp) => emp.homepoint)
                  .filter((point) => point); // Other employees
                destination = organization?.data?.geoCode; // Office
              } else {
                origin = organization?.data?.geoCode; // Office
                waypoints = updatedEmployees
                  .slice(0, updatedEmployees.length - 1)
                  .map((emp) => emp.homepoint); // Employees
                destination =
                  updatedEmployees[updatedEmployees.length - 1]?.homepoint; // Last employee
              }

              const cabRouteResponse =
                await this.googleMapService.calculateCabRoute(
                  origin,
                  destination,
                  waypoints,
                );
              //End of calculation

              // Distance-based buffer lookup for new trip
              const rawBufferNewTrip =
                await this.configurationService.getConfigValue(
                  pickDrop === 'Pick' ? 'Pick Buffer' : 'Drop Buffer',
                  user.orgID,
                );
              const bufferMinutesNewTrip = getBufferForDistance(
                parseBufferConfig(rawBufferNewTrip),
                cabRouteResponse?.totalDistanceKm ?? 0,
              );
              const arrivalTimeBuffer =
                pickDrop === 'Pick' ? bufferMinutesNewTrip : 0;
              const dropTimeBuffer =
                pickDrop === 'Drop' ? bufferMinutesNewTrip : 0;

              const employeesWithEstTime =
                await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
                  pickDrop,
                  shiftTime,
                  cabRouteResponse?.legs,
                  updatedEmployees,
                  String(arrivalTimeBuffer),
                  String(dropTimeBuffer),
                  String(cabWaitingTimeBuffer),
                );

              const updatedTrip = await this.tripModel.update(
                //Update on newly assigned trip - (Add employee)
                {
                  employees: employeesWithEstTime, // Assign employees with cab est time
                  spockID: spockID,
                  spockCode: spockCode,
                  spock: spock,
                  estimatedOccupancy: estimatedOccupancy,
                  estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
                  routeLegs: cabRouteResponse?.legs,
                },
                { where: { id: id }, returning: true, transaction },
              );
              //   console.log('updatedTrip---', updatedTrip);

              const tripToBeRemoved = await this.tripModel.findOne({
                where: { id: isTripRequestExist?.items?.[0]?.trip?.id },
                transaction,
              });

              const oldTripEmployees = Array.isArray(tripToBeRemoved?.employees)
                ? tripToBeRemoved.employees
                : [];

              const updatedOldTripEmployees = oldTripEmployees.filter(
                (emp) => String(emp.id) !== String(employeeData.id),
              );

              //Calculate distance, time & legs
              //   console.log(
              //     'updatedOldTripEmployees---',
              //     updatedOldTripEmployees,
              //   );

              if (pickDrop === 'Pick') {
                origin = updatedOldTripEmployees[0]?.homepoint; // First employee
                waypoints = updatedOldTripEmployees
                  .slice(1)
                  .map((emp) => emp.homepoint)
                  .filter((point) => point); // Other employees
                destination = organization?.data?.geoCode; // Office
              } else {
                origin = organization?.data?.geoCode; // Office
                waypoints = updatedOldTripEmployees
                  .slice(0, updatedOldTripEmployees.length - 1)
                  .map((emp) => emp.homepoint); // Employees
                destination =
                  updatedOldTripEmployees[updatedOldTripEmployees.length - 1]
                    ?.homepoint; // Last employee
              }

              const cabRouteOldTripResponse =
                await this.googleMapService.calculateCabRoute(
                  origin,
                  destination,
                  waypoints,
                );
              //End of calculation

              // Distance-based buffer lookup for old trip
              const rawBufferOldTrip =
                await this.configurationService.getConfigValue(
                  pickDrop === 'Pick' ? 'Pick Buffer' : 'Drop Buffer',
                  user.orgID,
                );
              const bufferMinutesOldTrip = getBufferForDistance(
                parseBufferConfig(rawBufferOldTrip),
                cabRouteOldTripResponse?.totalDistanceKm ?? 0,
              );
              const arrivalTimeBufferOld =
                pickDrop === 'Pick' ? bufferMinutesOldTrip : 0;
              const dropTimeBufferOld =
                pickDrop === 'Drop' ? bufferMinutesOldTrip : 0;

              const oldEmployeesWithEstTime =
                await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
                  pickDrop,
                  shiftTime,
                  cabRouteOldTripResponse?.legs,
                  updatedOldTripEmployees,
                  String(arrivalTimeBufferOld),
                  String(dropTimeBufferOld),
                  String(cabWaitingTimeBuffer),
                );

              await this.tripModel.update(
                //Update on old trip - (Remove employee from old trip)
                {
                  employees: oldEmployeesWithEstTime,
                  estimatedDistance:
                    cabRouteOldTripResponse?.totalDistanceKm + ' km',
                  routeLegs: cabRouteOldTripResponse?.legs,
                },
                {
                  where: { id: isTripRequestExist?.items?.[0]?.trip?.id },
                  returning: true,
                  transaction,
                },
              );
              await this.tripRequestModel.update(
                { tripID: id, emergencyType: emergencyType },
                {
                  where: { id: isTripRequestExist?.items?.[0]?.tripRequestID },
                  returning: true,
                },
              );

              await transaction.commit();
              return {
                message: 'Trips updated successfully',
                data: updatedTrip,
              };
            } catch (error) {
              await transaction.rollback();
            }
          } //If trip req exist, and not assigned to any trip
          else {
            const existingTrip = await this.tripModel.findOne({
              where: { id: id },
            });
            const existingEmployees = Array.isArray(existingTrip?.employees)
              ? existingTrip.employees
              : [];

            const employeeData = {
              id: employeeDetails?.id,
              empCode: employeeDetails?.employeeCode,
              name: employeeDetails?.name,
              location: employeeDetails?.location?.name,
              address: employeeDetails?.address,
              landmark: employeeDetails?.landmark,
              homepoint: employeeDetails?.homePoint,
              commuteDistance: employeeDetails?.commuteDistance,
              gender: employeeDetails?.gender,
              tripRequestID: isTripRequestExist?.items?.[0]?.tripRequestID,
              noShow: isTripRequestExist?.items?.[0]?.noShow,
              deboard: isTripRequestExist?.items?.[0]?.deboard ?? false,
              attendance: isTripRequestExist?.items?.[0]?.attendance,
            };

            const updatedEmployees = [...existingEmployees, employeeData];

            //Calculate distance, time & legs
            let origin, destination, waypoints;

            if (pickDrop === 'Pick') {
              origin = updatedEmployees[0]?.homepoint; // First employee
              waypoints = updatedEmployees
                .slice(1)
                .map((emp) => emp.homepoint)
                .filter((point) => point); // Other employees
              destination = organization?.data?.geoCode; // Office
            } else {
              origin = organization?.data?.geoCode; // Office
              waypoints = updatedEmployees
                .slice(0, updatedEmployees.length - 1)
                .map((emp) => emp.homepoint); // Employees
              destination =
                updatedEmployees[updatedEmployees.length - 1]?.homepoint; // Last employee
            }

            const cabRouteResponse =
              await this.googleMapService.calculateCabRoute(
                origin,
                destination,
                waypoints,
              );
            //End of calculation

            // Distance-based buffer lookup
            const rawBufferExistReq =
              await this.configurationService.getConfigValue(
                pickDrop === 'Pick' ? 'Pick Buffer' : 'Drop Buffer',
                user.orgID,
              );
            const bufferMinutesExistReq = getBufferForDistance(
              parseBufferConfig(rawBufferExistReq),
              cabRouteResponse?.totalDistanceKm ?? 0,
            );
            const arrivalTimeBufferExistReq =
              pickDrop === 'Pick' ? bufferMinutesExistReq : 0;
            const dropTimeBufferExistReq =
              pickDrop === 'Drop' ? bufferMinutesExistReq : 0;

            const employeesWithEstTime =
              await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
                pickDrop,
                shiftTime,
                cabRouteResponse?.legs,
                updatedEmployees,
                String(arrivalTimeBufferExistReq),
                String(dropTimeBufferExistReq),
                String(cabWaitingTimeBuffer),
              );

            const updatedTrip = await this.tripModel.update(
              {
                employees: employeesWithEstTime,
                spockID: spockID,
                spockCode: spockCode,
                spock: spock,
                estimatedOccupancy: estimatedOccupancy,
                estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
                routeLegs: cabRouteResponse?.legs,
              },
              {
                where: { id: id },
                returning: true,
              },
            );
            await this.tripRequestModel.update(
              { tripID: id, emergencyType: emergencyType },
              {
                where: { id: isTripRequestExist?.items?.[0]?.tripRequestID },
                returning: true,
              },
            );
            return {
              message: 'Trips updated successfully',
              data: updatedTrip,
            };
          }
        } //If employee without trip & trip request
        else {
          let selectedDates: string[] = [];
          const formattedDate = moment(date).format('YYYY-MM-DD');
          selectedDates = [formattedDate];

          //   const createTripRequestInput = {
          //     selectedDates,
          //     loginTime: pickDrop === PickDrop.Pick ? shiftTime : '',
          //     logoutTime: pickDrop === PickDrop.Drop ? shiftTime : '',
          //     pickDrop: pickDrop === PickDrop.Pick ? true : false,
          //     emergencyType: emergencyType,
          //   };

          const createTripRequestInput = {
            loginTime: pickDrop === PickDrop.Pick ? shiftTime : '',
            logoutTime: pickDrop === PickDrop.Drop ? shiftTime : '',
            pickDrop: pickDrop === PickDrop.Pick ? true : false,
            emergencyType: emergencyType,
            emergencyDate: null, // you can set a real date if required
            remarks: '', // this can be dynamic, replace with your variable
            loginTime1: '', // add logic if you have another slot
            logoutTime1: '', // add logic if you have another slot
            status: 'Requested',
            selectedDates: selectedDates, // already in correct format
            employeeCodes: [employeeDetails.employeeCode],
          };

          const userForEmployee = {
            employeeID: empId,
            id: user?.id,
            orgID: user?.orgID,
            name: user?.name,
          };
          let tripRequest: any;
          if (emergencyType == null) {
            tripRequest = await this.tripRequestService.createBatchTripRequest(
              createTripRequestInput,
              userForEmployee,
            );
          } else {
            tripRequest =
              await this.tripRequestService.adminEmergencyTripRequestUpdate(
                createTripRequestInput,
                userForEmployee,
              );
          }
          //   const tripRequest = await this.tripRequestService.create(
          //     createTripRequestInput,
          //     userForEmployee,
          //   );
          const existingTrip = await this.tripModel.findOne({
            where: { id: id },
          });
          const existingEmployees = Array.isArray(existingTrip?.employees)
            ? existingTrip.employees
            : [];

          const employeeData = {
            id: employeeDetails?.id,
            empCode: employeeDetails?.employeeCode,
            name: employeeDetails?.name,
            location: employeeDetails?.location?.name,
            address: employeeDetails?.address,
            landmark: employeeDetails?.landmark,
            homepoint: employeeDetails?.homePoint,
            commuteDistance: employeeDetails?.commuteDistance,
            gender: employeeDetails?.gender,
            tripRequestID: tripRequest?.data?.id,
            noshow: tripRequest?.data?.noShow,
            deboard: tripRequest?.data?.deboard ?? false,
            attendance: tripRequest?.data?.attendance,
          };
          const updatedEmployees = [...existingEmployees, employeeData];

          //Calculate distance, time & legs
          let origin, destination, waypoints;

          if (pickDrop === 'Pick') {
            origin = updatedEmployees[0]?.homepoint; // First employee
            waypoints = updatedEmployees
              .slice(1)
              .map((emp) => emp.homepoint)
              .filter((point) => point); // Other employees
            destination = organization?.data?.geoCode; // Office
          } else {
            origin = organization?.data?.geoCode; // Office
            waypoints = updatedEmployees
              .slice(0, updatedEmployees.length - 1)
              .map((emp) => emp.homepoint); // Employees
            destination =
              updatedEmployees[updatedEmployees.length - 1]?.homepoint; // Last employee
          }

          const cabRouteResponse =
            await this.googleMapService.calculateCabRoute(
              origin,
              destination,
              waypoints,
            );
          //End of calculation

          // Distance-based buffer lookup
          const rawBufferNoReq = await this.configurationService.getConfigValue(
            pickDrop === 'Pick' ? 'Pick Buffer' : 'Drop Buffer',
            user.orgID,
          );
          const bufferMinutesNoReq = getBufferForDistance(
            parseBufferConfig(rawBufferNoReq),
            cabRouteResponse?.totalDistanceKm ?? 0,
          );
          const arrivalTimeBufferNoReq =
            pickDrop === 'Pick' ? bufferMinutesNoReq : 0;
          const dropTimeBufferNoReq =
            pickDrop === 'Drop' ? bufferMinutesNoReq : 0;

          const employeesWithEstTime =
            await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
              pickDrop,
              shiftTime,
              cabRouteResponse?.legs,
              updatedEmployees,
              String(arrivalTimeBufferNoReq),
              String(dropTimeBufferNoReq),
              String(cabWaitingTimeBuffer),
            );

          const updatedTrip = await this.tripModel.update(
            {
              employees: employeesWithEstTime, // Assign employees with cab est time
              spockID: spockID,
              spockCode: spockCode,
              spock: spock,
              estimatedOccupancy: estimatedOccupancy,
              estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
              routeLegs: cabRouteResponse?.legs,
            },
            {
              where: { id: id },
              returning: true,
            },
          );
          await this.tripRequestModel.update(
            { tripID: id },
            { where: { id: tripRequest?.data?.id }, returning: true },
          );
          return {
            message: 'Trips updated successfully',
            data: updatedTrip,
          };
        }
      }
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }
  async updateEmployeeOrderTrip(updateTripInput: any, user: any): Promise<any> {
    try {
      // Fetched before any computation below — this is the ONLY point
      // where the pre-reorder employee sequence, tripLocation, and
      // estimatedDistance are available. updateTripInput.updatedTrips
      // carries the NEW (already reordered) employees array from the
      // frontend, not the old one.
      const existingTrip = await this.tripModel.findOne({
        where: { id: updateTripInput?.updatedTrips?.id },
      });

      let newTripLocation = null;
      const cabWaitingTimeConfigOrder =
        await this.configurationService.getMultipleConfigValues(
          ['Cab waiting time'],
          { orgID: user.orgID },
        );
      const { 'Cab waiting time': cabWaitingTimeBuffer } =
        cabWaitingTimeConfigOrder?.data || {};
      if (updateTripInput?.updatedTrips?.pickDrop === 'Pick') {
        newTripLocation = updateTripInput?.updatedTrips?.employees[0]?.address;
      } else {
        const employeeLength = updateTripInput?.updatedTrips?.employees?.length;
        newTripLocation =
          updateTripInput?.updatedTrips?.employees[employeeLength - 1]?.address;
      }

      //Calculate distance, waypoints
      let origin, destination, waypoints;

      const organization = await this.organizationService.findOne(user?.orgID);

      if (updateTripInput?.updatedTrips?.pickDrop === 'Pick') {
        origin = updateTripInput?.updatedTrips?.employees[0]?.homepoint; // First employee
        waypoints = updateTripInput?.updatedTrips?.employees
          .slice(1)
          .map((emp) => emp.homepoint)
          .filter((point) => point); // Other employees
        destination = organization?.data?.geoCode; // Office
      } else {
        origin = organization?.data?.geoCode; // Office
        waypoints = updateTripInput?.updatedTrips?.employees
          .slice(0, updateTripInput?.updatedTrips?.employees.length - 1)
          .map((emp) => emp.homepoint); // Employees
        destination =
          updateTripInput?.updatedTrips?.employees[
            updateTripInput?.updatedTrips?.employees.length - 1
          ]?.homepoint; // Last employee
      }

      const cabRouteResponse = await this.googleMapService.calculateCabRoute(
        origin,
        destination,
        waypoints,
      );
      //End of calculation

      // Distance-based buffer lookup
      const rawBufferOrder = await this.configurationService.getConfigValue(
        updateTripInput?.updatedTrips?.pickDrop === 'Pick'
          ? 'Pick Buffer'
          : 'Drop Buffer',
        user.orgID,
      );
      const bufferMinutesOrder = getBufferForDistance(
        parseBufferConfig(rawBufferOrder),
        cabRouteResponse?.totalDistanceKm ?? 0,
      );
      const arrivalTimeBuffer =
        updateTripInput?.updatedTrips?.pickDrop === 'Pick'
          ? bufferMinutesOrder
          : 0;
      const dropTimeBuffer =
        updateTripInput?.updatedTrips?.pickDrop === 'Drop'
          ? bufferMinutesOrder
          : 0;

      const employeesWithEstTime =
        await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
          updateTripInput?.updatedTrips?.pickDrop,
          updateTripInput?.updatedTrips?.shiftTime,
          cabRouteResponse?.legs,
          updateTripInput?.updatedTrips?.employees,
          String(arrivalTimeBuffer),
          String(dropTimeBuffer),
          String(cabWaitingTimeBuffer),
        );

      const updatedTrip = await this.tripModel.update(
        {
          tripLocation: newTripLocation,
          employees: employeesWithEstTime, // Assign employees with cab est time
          estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
          routeLegs: cabRouteResponse?.legs,
        },
        { where: { id: updateTripInput?.updatedTrips?.id }, returning: true },
      );
      const updatedRow = updatedTrip?.[1]?.[0];

      // Formats a date as DD/MM/YYYY, date-only.
      const formatDateOnly = (value: any): string => {
        if (!value) return 'N/A';
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      };

      const oldOrder =
        existingTrip?.employees?.map((e: any) => e.name).join(' -> ') ?? 'N/A';
      const newOrder =
        updatedRow?.employees?.map((e: any) => e.name).join(' -> ') ?? 'N/A';

      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      if (oldOrder !== newOrder) {
        changeJSON['Employee Order'] = {
          OldValue: oldOrder,
          newValue: newOrder,
        };
      }
      if (existingTrip?.tripLocation !== updatedRow?.tripLocation) {
        changeJSON['Trip Location'] = {
          OldValue: existingTrip?.tripLocation ?? 'N/A',
          newValue: updatedRow?.tripLocation ?? 'N/A',
        };
      }
      if (existingTrip?.estimatedDistance !== updatedRow?.estimatedDistance) {
        changeJSON['Estimated Distance'] = {
          OldValue: existingTrip?.estimatedDistance ?? 'N/A',
          newValue: updatedRow?.estimatedDistance ?? 'N/A',
        };
      }

      const tripLabel = `Trip ${
        updatedRow?.id ?? existingTrip?.id
      } (${formatDateOnly(updatedRow?.date ?? existingTrip?.date)} - ${
        updatedRow?.shiftTime ?? existingTrip?.shiftTime
      })`;

      const eventLog = {
        objectType: 'Trip',
        changeType: 'edit',
        objectID: updateTripInput?.updatedTrips?.id,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: {
          tripID: updatedRow?.id,
          routeNumber: updatedRow?.routeNumber,
          date: updatedRow?.date,
          shiftTime: updatedRow?.shiftTime,
          employeeCount: updatedRow?.employees?.length ?? 0,
          estimatedDistance: updatedRow?.estimatedDistance,
        },
        requestPayload: { updateTripInput },
        changeJSON,
        customDescription: `reordered employees for ${tripLabel}`,
        user,
      };
      this.eventlogService
        .create(eventLog)
        .catch((err) => this.logger.error('Event log failed', err));

      return {
        message: 'Employee updated successfully',
        data: updatedRow ?? [],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async importTripsheet(
    file: Buffer,
    date: any,
    formattedSelectedDate: any,
    user: any,
    action: string,
    selectedRows: number[] = [],
  ): Promise<object> {
    try {
      this.logger.log('import service---', file);
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
      });

      if (!sheetData?.length) {
        throw new BadRequestException('The Excel file is empty.');
      }

      const sheetDataObjects: any = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        { raw: false },
      );

      if (!sheetDataObjects?.length) {
        throw new BadRequestException(
          'The Excel file contains no valid data rows.',
        );
      }
      const formatted = moment(date?.date)
        .tz('Asia/Kolkata')
        .format('YYYY-MM-DD');
      const selectedDates: string[] = [formatted];

      let validatedData: any = null;
      let cabArrivalTimeProvided = false;

      try {
        const result = await this.validateTripSheetData(
          sheetDataObjects,
          user,
          formatted,
        );
        validatedData = result.rows.map((item, index) => ({
          ...item,
          rowNumber: index + 2,
        }));
        cabArrivalTimeProvided = result.cabArrivalTimeProvided;
      } catch (error) {
        throw new BadRequestException(
          `Data validation failed: ${error.message}`,
        );
      }
      validatedData = validatedData.map((item, index) => ({
        ...item,
        rowNumber: index + 2, // +2 to account for header row and 0-based index,
      }));

      // GET ALL EMPLOYEES IN ONE GO
      const empCodes = validatedData.map((v) => v.row.EmpId);

      const employees = await this.employeeModel.findAll({
        where: {
          employeeCode: empCodes,
          orgID: user?.orgID,
        },
        include: [
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
        ],
      });

      const employeeMap = new Map();
      employees.forEach((emp) => {
        employeeMap.set(emp.employeeCode, emp);
      });

      //  STEP 1: COLLECT ALL DUPLICATE CHECK CONDITIONS
      const duplicateCheckPayload = [];

      for (const { row } of validatedData) {
        const { Direction } = row;

        const employee = employeeMap.get(row.EmpId);

        if (!employee) continue;

        duplicateCheckPayload.push({
          employeeID: employee.id,
          date: formatted,
          pickDrop: Direction.toLowerCase() === 'pick',
        });
      }

      //  STEP 2: FIND EXISTING TRIPS IN BULK
      const existingTrips = await this.tripRequestModel.findAll({
        where: {
          [Op.or]: duplicateCheckPayload,
          status: {
            [Op.in]: [Status.Approved, Status.Requested],
          },
        },
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['employeeCode'],
            required: false,
          },
          {
            model: Trip,
            as: 'trip',
            attributes: ['pickDrop'],
            required: false, //  avoid inner join issues
          },
        ],
      });
      // console.log('existingTrips check---->',existingTrips)
      const existingTripMap = new Map();

      existingTrips.forEach((t) => {
        const key = `${t.employeeID}_${moment(t.date).format('YYYY-MM-DD')}_${
          t.pickDrop
        }`;
        existingTripMap.set(key, t);
      });

      //  STEP 4: FIRST CALL → RETURN DUPLICATES
      if (existingTrips.length > 0 && !action) {
        const duplicateRows = [];

        for (const { row, rowNumber } of validatedData) {
          const employee = employeeMap.get(row.EmpId);

          if (!employee) continue;

          const key = `${employee.id}_${formatted}_${
            row.Direction.toLowerCase() === 'pick'
          }`;

          if (existingTripMap.has(key)) {
            duplicateRows.push({
              rowNumber,
              empId: row.EmpId,
              date: moment(formatted).format('DD/MM/YYYY'),
              shiftTime: row['Shift Time'],
              pickDrop: row.Direction,
            });
          }
        }

        return {
          duplicate: true,
          message: 'Duplicate data found',
          data: duplicateRows,
        };
      }
      const vendorCodes = [
        ...new Set(validatedData.map((v) => v.row['Vendor Code']?.trim())),
      ];

      const vendors = await this.vendorRequestModel.findAll({
        where: { orgID: user?.orgID },
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'code'],
            where: { code: vendorCodes },
            required: true,
          },
        ],
      });

      const vendorMap = new Map();
      vendors.forEach((v) => {
        vendorMap.set(v.vendor.code, v.vendor.id);
      });

      const overwriteIds = new Set<string>();
      const processRows: any[] = [];

      for (const item of validatedData) {
        const { row, rowNumber } = item;

        const employee = employeeMap.get(row.EmpId);
        if (!employee) continue;

        const key = `${employee.id}_${formatted}_${
          row.Direction.toLowerCase() === 'pick'
        }`;

        const isDuplicate = existingTripMap.has(key);
        const isSelected = selectedRows.includes(rowNumber);

        let shouldProcess = true;
        let shouldOverwrite = false;

        if (isDuplicate) {
          if (action === 'OVERWRITE_SELECTED') {
            shouldOverwrite = isSelected;
            shouldProcess = isSelected;
          }

          if (action === 'SKIP_SELECTED') {
            shouldProcess = !isSelected;
            shouldOverwrite = !isSelected;
          }
        }

        if (!shouldProcess) continue;

        const existingTrip = existingTripMap.get(key);
        if (shouldOverwrite && existingTrip) {
          overwriteIds.add(existingTrip.id.toString());
        }

        processRows.push(item);
      }

      if (overwriteIds.size) {
        await this.tripRequestService.updateStatus([...overwriteIds], 'Reject');
      }

      const routeMap = new Map();

      for (const { row } of processRows) {
        const employeeDetails = employeeMap.get(row.EmpId);
        if (!employeeDetails) continue;

        const {
          'Route No': routeNumber,
          // 'Planned Time': plannedTime,
          'Cab Arrival Time': cabArrivalTime,
          Direction,
          'Shift Time': scheduledTime,
          'Vendor Code': vendorCode,
          'Spock/Security': spock,
          'Vehicle Number': vehicleNumber,
          'Driver Code': driverCode,
          Seats: seats,
          driverID,
          cabID,
          ...rest
        } = row;
        const formattedVendorCode = vendorCode?.trim();

        const createTripRequestInput = {
          selectedDates,
          loginTime: Direction.toLowerCase() === 'pick' ? scheduledTime : null,
          logoutTime: Direction.toLowerCase() === 'drop' ? scheduledTime : null,
          pickDrop: Direction.toLowerCase() === 'pick',
          status: Status.Approved,
        };

        const userForEmployee = {
          employeeID: employeeDetails?.id,
          id: user?.id,
          orgID: user?.orgID,
          name: user?.name,
        };

        const tripRequest = await this.tripRequestService.create(
          createTripRequestInput,
          userForEmployee,
        );

        const employeeData = {
          id: employeeDetails?.id,
          empCode: employeeDetails?.employeeCode,
          name: employeeDetails?.name,
          location: employeeDetails?.location?.name,
          address: employeeDetails?.address,
          landmark: employeeDetails?.landmark,
          homepoint: employeeDetails?.homePoint,
          gender: employeeDetails?.gender,
          tripRequestID: tripRequest?.data?.id,
          noshow: tripRequest?.data?.noShow,
          deboard: tripRequest?.data?.deboard ?? false,
          attendance: tripRequest?.data?.attendance,
          specialConsideration: employeeDetails?.specialConsideration, // ← Add this line
          commuteDistance: employeeDetails?.commuteDistance,
          cabArrivalTime: cabArrivalTime?.trim(),
        };

        const routeKey = `${routeNumber}_${Direction}_${scheduledTime}`;

        if (!routeMap.has(routeKey)) {
          routeMap.set(routeKey, {
            routeNumber: routeNumber,
            vendorCode: formattedVendorCode,
            vendorID: vendorMap.get(formattedVendorCode),
            scheduledTime: scheduledTime,
            // plannedTime: plannedTime,
            vehicleNumber: vehicleNumber?.trim(),
            driverCode: driverCode?.trim(),
            driverID: driverID ?? null, // NEW
            cabID: cabID ?? null,
            ...rest,
            orgID: user?.orgID,
            pickDrop: Direction,
            shiftTime: scheduledTime,
            date: formatted,
            seats: seats,
            spock: spock == 1 ? true : false,
            status: TripStatus.Pending,
            lockStatus: Status.Inactive,
            employees: [],
          });
        }
        routeMap.get(routeKey).employees.push(employeeData);
      }
      const organization = await this.organizationService.findOne(user?.orgID);
      const configValues =
        await this.configurationService.getMultipleConfigValues(
          ['Cab waiting time', 'Pick Buffer', 'Drop Buffer'],
          { orgID: user.orgID },
        );
      const {
        'Cab waiting time': cabWaitingTimeBuffer,
        'Pick Buffer': rawPickBuffer,
        'Drop Buffer': rawDropBuffer,
      } = configValues.data;

      if (!cabWaitingTimeBuffer || !rawPickBuffer || !rawDropBuffer) {
        throw new BadRequestException(
          'Missing configuration values for cab waiting time or buffers.',
        );
      }
      await this.calculateCabArrivaltimeOnImport(
        routeMap,
        cabArrivalTimeProvided,
        organization,
        cabWaitingTimeBuffer,
        rawPickBuffer,
        rawDropBuffer,
      );
      // for (const [routeNumber, routeData] of routeMap.entries()) { below code indictaes this
      for (const route of routeMap.values()) {
        route.estimatedOccupancy = route.employees.length;
      }

      validatedData = Array.from(routeMap.values());

      //  STEP 7: SAVE TRIPS
      const transaction = await this.sequelize.transaction();
      let trips: Trip[];
      try {
        trips = await this.tripModel.bulkCreate(validatedData, {
          transaction,
        });
        // Map routeNumber to tripId for quick access
        const tripMap = new Map();
        for (const trip of trips) {
          tripMap.set(
            `${trip.routeNumber}_${trip.pickDrop}_${trip.scheduledTime}`,
            trip.id,
          );
        }
        // Create bulk update promises for all tripRequestIDs
        // const tripRequestUpdates = [];
        const tripIdToRequestIds = new Map<number, number[]>();

        for (const trip of validatedData) {
          const key = `${trip.routeNumber}_${trip.pickDrop}_${trip.scheduledTime}`;
          const tripID = tripMap.get(key);
          for (const employee of trip.employees) {
            // if (employee.tripRequestID && tripID) {
            //   tripRequestUpdates.push(
            //     this.tripRequestModel.update(
            //       { tripID: tripID },
            //       { where: { id: employee.tripRequestID }, transaction },
            //     ),
            //   );
            // }
            if (employee.tripRequestID) {
              if (!tripIdToRequestIds.has(tripID)) {
                tripIdToRequestIds.set(tripID, []);
              }
              tripIdToRequestIds.get(tripID).push(employee.tripRequestID);
            }
          }
        }
        await Promise.all(
          Array.from(tripIdToRequestIds.entries()).map(([tripID, requestIds]) =>
            this.tripRequestModel.update(
              { tripID },
              {
                where: { id: { [Op.in]: requestIds } },
                transaction,
              },
            ),
          ),
        );

        await transaction.commit();
        // return {
        //   message: `${validatedData?.length} trips were created successfully.`,
        // };
      } catch (error) {
        await transaction.rollback();
        throw new BadRequestException(`Import failed: ${error.message}`);
      }

      // EVENT LOG — AFTER SUCCESSFUL TRANSACTION
      const createdTrips = trips.map((trip) => trip?.dataValues ?? trip);

      // Was payload: createdTrips — an array of raw Trip instances. With
      // changeType 'add' (no changeJSON), DetailTable's payloadJSON
      // branch does Object.entries() on it, giving index keys ("0", "1")
      // with no .label on the values, so every row rendered blank. Flat
      // scalar summary instead, with tripIDs joined into a string (an
      // array value here would hit the same no-.label blank-cell issue).
      const totalEmployeesRouted = createdTrips.reduce(
        (sum, trip) => sum + (trip.employees?.length ?? 0),
        0,
      );

      const eventLog = {
        objectType: 'Trip',
        objectID: null,
        authID: user?.id,
        orgID: user?.orgID,
        updatedBy: user?.name,
        changeType: 'add',

        payload: {
          date: formatted,
          tripCount: createdTrips.length,
          tripIDs: createdTrips.map((trip) => trip.id).join(', '),
          employeesRouted: totalEmployeesRouted,
        },

        requestPayload: {
          importType: 'tripsheet',
          date: formatted,
          action,
          selectedRows,
          tripCount: createdTrips?.length,
        },

        customDescription: `imported ${
          createdTrips?.length
        } Trips from tripsheet for ${moment(formatted).format('DD/MM/YYYY')}`,
        user,
      };

      // Fire and forget — event log failure should not fail import
      this.eventlogService
        .create(eventLog)
        .catch((err) => this.logger.error('Trip import event log failed', err));

      return {
        message: `${createdTrips?.length} trips were created successfully.`,
      };
    } catch (error) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  private async calculateCabArrivaltimeOnImport(
    routeMap: Map<string, any>,
    cabArrivalTimeProvided: boolean,
    organization: any,
    cabWaitingTimeBuffer: any,
    rawPickBuffer: any,
    rawDropBuffer: any,
  ): Promise<void> {
    for (const route of routeMap.values()) {
      const employees = route.employees;
      if (!employees?.length) continue;

      if (cabArrivalTimeProvided) {
        await this.persistProvidedCabArrivalTimes(route, employees);
        continue;
      }

      let origin, destination, waypoints;

      if (route.pickDrop === 'Pick') {
        origin = employees[0]?.homepoint;
        waypoints = employees
          .slice(1)
          .map((e) => e.homepoint)
          .filter(Boolean);
        destination = organization?.data?.geoCode;
      } else {
        origin = organization?.data?.geoCode;
        waypoints = employees
          .slice(0, employees.length - 1)
          .map((e) => e.homepoint)
          .filter(Boolean);
        destination = employees[employees.length - 1]?.homepoint;
      }

      if (!origin || !destination) {
        this.logger.warn(
          `Skipping planned-time calc for route ${route.routeNumber}: missing geo data`,
        );
        continue;
      }

      let cabRouteResponse;
      try {
        cabRouteResponse = await this.googleMapService.calculateCabRoute(
          origin,
          destination,
          waypoints,
        );
      } catch (err: any) {
        this.logger.error(
          `Google route calc failed for route ${route.routeNumber}: ${err.message}`,
        );
        continue; // keep plannedTime null rather than failing the whole import
      }

      const totalDistanceKm = cabRouteResponse?.totalDistanceKm ?? 0;
      let arrivalTimeBuffer = 0;
      let dropTimeBuffer = 0;

      if (route.pickDrop === 'Pick') {
        arrivalTimeBuffer = getBufferForDistance(
          parseBufferConfig(rawPickBuffer),
          totalDistanceKm,
        );
      } else {
        dropTimeBuffer = getBufferForDistance(
          parseBufferConfig(rawDropBuffer),
          totalDistanceKm,
        );
      }

      let employeesWithEstTime;
      try {
        employeesWithEstTime =
          await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
            route.pickDrop,
            route.shiftTime,
            cabRouteResponse?.legs,
            employees,
            String(arrivalTimeBuffer),
            String(dropTimeBuffer),
            String(cabWaitingTimeBuffer),
          );
      } catch (err: any) {
        this.logger.error(
          `Est-time calc failed for route ${route.routeNumber}: ${err.message}`,
        );
        continue; // leave this route's employees without cabArrivalTime rather than killing the whole import
      }

      route.employees = employeesWithEstTime;
      route.estimatedDistance = cabRouteResponse?.totalDistanceKm + ' km';
      route.routeLegs = cabRouteResponse?.legs;
      // route.plannedTime = employeesWithEstTime[0]?.cabArrivalTime ?? null;
    }
  }

  private async persistProvidedCabArrivalTimes(
    route: any,
    employees: any[],
  ): Promise<void> {
    const updates = employees
      .filter((e) => e.cabArrivalTime && e.tripRequestID)
      .map((e) =>
        this.tripRequestModel.update(
          route.pickDrop === 'Pick'
            ? { pickUpTime: e.cabArrivalTime }
            : { dropTime: e.cabArrivalTime },
          { where: { id: e.tripRequestID } },
        ),
      );
    await Promise.all(updates);
    // route.plannedTime = employees[0]?.cabArrivalTime ?? null;
  }

  // async lockTrip(user: any, tripData: any[]): Promise<any> {
  //   try {
  //     const updatedTrips = await Promise.all(
  //       tripData.map(async (trip) => {
  //         const updatedTrip = await this.tripModel.update(
  //           { ...trip, lockStatus: Status.Active },
  //           {
  //             where: {
  //               shiftTime: trip?.shiftTime,
  //               date: trip?.date,
  //               id: trip?.id,
  //               orgID: user?.orgID,
  //             },
  //             returning: true,
  //           },
  //         );
  //         return updatedTrip?.[1]?.[0];
  //       }),
  //     );

  //     return {
  //       message: 'Trips updated successfully',
  //       data: updatedTrips,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async lockTrip(user: any, tripData: any[]): Promise<any> {
    try {
      const updatedTrips = await Promise.all(
        tripData.map(async (trip) => {
          const updatedTrip = await this.tripModel.update(
            { ...trip, lockStatus: trip.lockStatus },
            {
              where: {
                shiftTime: trip?.shiftTime,
                date: trip?.date,
                id: trip?.id,
                orgID: user?.orgID,
              },
              returning: true,
            },
          );

          return updatedTrip?.[1]?.[0];
        }),
      );

      const eventPayload = {
        tripData,
      };

      const lockStatus =
        tripData[0]?.lockStatus === Status.Active ? 'locked' : 'unlocked';

      // Was payload: updatedTrips — an array of raw Trip instances. With
      // no changeJSON set, DetailTable's payloadJSON branch does
      // Object.entries() on it, giving index keys ("0", "1") with no
      // .label on the values, so every row rendered blank. Flat scalar
      // summary instead, with tripIDs joined into a string (an array
      // value here would hit the same no-.label blank-cell issue).
      const eventLog = {
        objectType: `Trip`,
        changeType: 'edit',
        objectID: null,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: {
          date: tripData[0]?.date,
          shiftTime: tripData[0]?.shiftTime,
          lockStatus,
          tripCount: updatedTrips.length,
          tripIDs: updatedTrips
            .filter(Boolean)
            .map((trip) => trip.id)
            .join(', '),
        },
        requestPayload: eventPayload,
        customDescription: `${lockStatus} ${tripData?.length} trips of ${moment(
          tripData[0]?.date,
        ).format('DD/MM/YYYY')} - ${tripData[0]?.shiftTime}`,
        user,
      };
      await this.eventlogService.create(eventLog);

      return {
        message: 'Trips updated successfully',
        data: updatedTrips,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw new BadRequestException(error);
      }
      throw new InternalServerErrorException(error);
    }
  }

  //   async unlockTrip(user: any, tripData: any[]): Promise<any> {
  //     try {
  //       const updatedTrips = await Promise.all(
  //         tripData.map(async (trip) => {
  //           const updatedTrip = await this.tripModel.update(
  //             { ...trip, lockStatus: Status.Inactive },
  //             {
  //               where: {
  //                 shiftTime: trip?.shiftTime,
  //                 date: trip?.date,
  //                 id: trip?.id,
  //                 orgID: user?.orgID,
  //               },
  //               returning: true,
  //             },
  //           );
  //           return updatedTrip?.[1]?.[0];
  //         }),
  //       );

  //       return {
  //         message: 'Trips updated successfully',
  //         data: updatedTrips,
  //       };
  //     } catch (error) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //       throw new InternalServerErrorException(error);
  //     }
  //   }

  private async validateTripSheetData(
    sheetData: any[],
    user: any,
    formattedDate: string,
  ): Promise<{ rows: any[]; cabArrivalTimeProvided: boolean }> {
    try {
      //trim mapper
      sheetData = sheetData.map(trimExcelRow);

      const validatedData: any[] = [];
      const employeeErrors: string[] = [];
      const formatErrors: string[] = [];
      const invalidVendors: string[] = [];
      const excelDuplicateSet = new Set<string>();
      const excelDuplicateErrors: string[] = [];

      const empCodes = new Set<string>();
      const vendorCodes = new Set<string>();
      const driverCodes = new Set<string>();
      const vehicleNumbers = new Set<string>();

      // NEW: in-file duplicate driver/cab tracking + occupancy errors
      const excelDuplicateDriverSet = new Set<string>();
      const excelDuplicateCabSet = new Set<string>();
      const driverOccupiedErrors: string[] = [];
      const cabOccupiedErrors: string[] = [];
      const seatErrors: string[] = [];

      sheetData.forEach((row) => {
        if (row.EmpId) empCodes.add(row.EmpId.trim());
        if (row['Vendor Code']) vendorCodes.add(row['Vendor Code'].trim());
        if (row['Driver Code']) driverCodes.add(row['Driver Code'].trim());
        if (row['Vehicle Number'])
          vehicleNumbers.add(row['Vehicle Number'].trim());
      });

      const cabArrivalValues = sheetData.map((row) =>
        row['Cab Arrival Time']?.trim(),
      );
      const filledCount = cabArrivalValues.filter(Boolean).length;

      if (filledCount > 0 && filledCount < sheetData.length) {
        throw new BadRequestException(
          `Cab Arrival Time must be provided for every row, or left empty for every row. ` +
            `Found ${filledCount} of ${sheetData.length} rows filled.`,
        );
      }
      const cabArrivalTimeProvided =
        filledCount === sheetData.length && sheetData.length > 0;

      // =========================================================
      //  STEP 2: FETCH ALL DATA IN PARALLEL
      // =========================================================

      const [employees, vendors, orgDrivers, orgCabs] = await Promise.all([
        this.employeeModel.findAll({
          where: {
            employeeCode: [...empCodes],
            orgID: user?.orgID,
            status: Status.Active,
          },
        }),

        this.vendorModel.findAll({
          where: { code: [...vendorCodes] },
        }),

        this.orgDriverModel.findAll({
          where: {
            orgID: user?.orgID,
            status: Status.Approved,
          },
          include: [
            {
              model: Driver,
              as: 'driver',
              where: { status: Status.Active },
              required: true,
            },
            {
              model: Vendor,
              as: 'vendor',
              required: true,
            },
          ],
        }),

        this.orgCabModel.findAll({
          where: {
            orgID: user?.orgID,
            status: Status.Approved,
          },
          include: [
            {
              model: Cab,
              as: 'cab',
              where: { status: Status.Active },
              required: true,
            },
            {
              model: Vendor,
              as: 'vendor',
              required: true,
            },
          ],
        }),
      ]);

      // =========================================================
      //  STEP 3: CREATE MAPS (O(1) LOOKUP)
      // =========================================================

      const employeeMap = new Map();
      employees.forEach((e) => employeeMap.set(e.employeeCode, e));

      const vendorMap = new Map();
      vendors.forEach((v) => vendorMap.set(v.code, v));

      const driverMap = new Map();
      orgDrivers.forEach((d) => {
        const key = `${d.driver.code}_${d.vendor.code}`;
        driverMap.set(key, d);
      });

      const cabMap = new Map();
      orgCabs.forEach((c) => {
        const key = `${c.cab.regNo}_${c.vendor.code}`;
        cabMap.set(key, c);
      });

      // =========================================================
      //  NEW STEP: FETCH OCCUPIED (ONGOING-ish) TRIPS FOR THIS DATE,
      //  FOR ONLY THE DRIVER/CAB IDS THAT APPEAR IN THIS SHEET.
      //  ONE extra query total, kept alongside the maps above.
      // =========================================================

      const candidateDriverIDs = new Set<number>();
      const candidateCabIDs = new Set<number>();
      // pre-scan to know which driver/cab IDs we even need to check occupancy for
      for (const row of sheetData) {
        const dCode = row['Driver Code']?.trim();
        const vCode = row['Vendor Code']?.trim();
        const veh = row['Vehicle Number']?.trim();

        // candidate scan
        if (dCode && vCode) {
          const d = driverMap.get(`${dCode}_${vCode}`);
          if (d) candidateDriverIDs.add(d.driverID);
        }
        if (veh && vCode) {
          const c = cabMap.get(`${veh}_${vCode}`);
          if (c) candidateCabIDs.add(c.cabID);
        }
      }

      const occupiedTrips = await this.tripModel.findAll({
        where: {
          orgID: user?.orgID,
          date: formattedDate,
          status: { [Op.notIn]: [TripStatus.Cancelled, TripStatus.Completed] },
          [Op.or]: [
            {
              driverID: { [Op.in]: [...candidateDriverIDs] },
            },
            {
              cabID: { [Op.in]: [...candidateCabIDs] },
            },
          ],
        },
        attributes: ['driverID', 'cabID', 'shiftTime', 'pickDrop', 'date'],
      });

      // key format for driver and cab : `${id}_${date}_${shiftTime}`
      const occupiedDriverSet = new Set<string>();
      const occupiedCabSet = new Set<string>();
      occupiedTrips.forEach((t) => {
        if (t.driverID) {
          occupiedDriverSet.add(`${t.driverID}_${t.date}_${t.shiftTime}`);
        }
        if (t.cabID) {
          occupiedCabSet.add(`${t.cabID}_${t.date}_${t.shiftTime}`);
        }
      });

      for (let index = 0; index < sheetData.length; index++) {
        const row = sheetData[index];

        const {
          'Route No': routeNumber,
          EmpId: employeeCode,
          'Vendor Code': vendorCode,
          'Shift Time': scheduledTime,
          // 'Planned Time': plannedTime,
          Direction,
          'Vehicle Number': vehicleNumber,
          'Driver Code': driverCode,
          Seats: seats,
        } = row;

        const formattedVendorCode = vendorCode?.trim();
        const formattedRouteNumber = routeNumber?.trim();
        const formattedEmpCode = employeeCode?.trim();
        const formattedScheduledTime = scheduledTime?.trim();
        // const formattedPlannedTime = plannedTime?.trim();
        const formattedDirection = Direction?.trim();
        const formattedVehicle = vehicleNumber?.trim();
        const formattedDriver = driverCode?.trim();
        const formattedCabArrivalTime = row['Cab Arrival Time']?.trim();

        row['Route No'] = formattedRouteNumber;
        row['EmpId'] = formattedEmpCode;
        row['Vendor Code'] = formattedVendorCode;
        row['Shift Time'] = formattedScheduledTime;
        // row['Planned Time'] = formattedPlannedTime;
        row['Cab Arrival Time'] = formattedCabArrivalTime;

        if (
          !formattedEmpCode ||
          !formattedRouteNumber ||
          !formattedDirection ||
          !formattedScheduledTime
        ) {
          formatErrors.push(
            `Row ${
              index + 2
            }: Missing required fields (EmployeeCode or RouteNumber or Direction or ShiftTime).`,
          );
          continue;
        }

        //  Employee check
        if (!employeeMap.has(formattedEmpCode)) {
          employeeErrors.push(
            `Row ${index + 2}: Invalid Employee '${formattedEmpCode}'`,
          );
        }

        //  Vendor check
        if (!formattedVendorCode || !vendorMap.has(formattedVendorCode)) {
          invalidVendors.push(
            `Row ${index + 2}: Invalid Vendor '${formattedVendorCode}'`,
          );
        }

        // EmployeeCode format
        if (!/^[A-Za-z0-9]+$/.test(formattedEmpCode)) {
          formatErrors.push(
            `Row ${
              index + 2
            }: Invalid EmployeeCode format '${employeeCode}' (should be alphanumeric).`,
          );
        }

        const timeFormat = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (
          formattedScheduledTime &&
          !timeFormat.test(formattedScheduledTime)
        ) {
          formatErrors.push(
            `Row ${
              index + 2
            }: Invalid shiftTime '${scheduledTime}' (should be in 'HH:MM' format).`,
          );
        }

        //  CHECK EXCEL DUPLICATE
        const directionValue = formattedDirection?.toLowerCase();

        const duplicateKey = `${formattedEmpCode}_${directionValue}`;

        if (excelDuplicateSet.has(duplicateKey)) {
          excelDuplicateErrors.push(
            `Row ${
              index + 2
            }: Duplicate entry found for Employee '${formattedEmpCode}' with Direction '${Direction}'`,
          );
        } else {
          excelDuplicateSet.add(duplicateKey);
        }

        //driver validation
        // if (formattedDriver) {
        //   const key = `${formattedDriver}_${formattedVendorCode}`;
        //   if (!driverMap.has(key)) {
        //     formatErrors.push(
        //       `Row ${
        //         index + 2
        //       }: Invalid Driver '${formattedDriver}' for Vendor '${formattedVendorCode}'`,
        //     );
        //   }
        // }

        // -----------------------------------------------------
        // DRIVER validation (existence, in-file duplicate, occupancy)
        // -----------------------------------------------------
        let resolvedDriverID: any;
        if (formattedDriver) {
          const key = `${formattedDriver}_${formattedVendorCode}`;
          const driverRecord = driverMap.get(key);
          if (!driverRecord) {
            formatErrors.push(
              `Row ${
                index + 2
              }: Invalid Driver '${formattedDriver}' for Vendor '${formattedVendorCode}'`,
            );
          } else {
            resolvedDriverID = driverRecord.driverID;

            const fileDriverKey = `${resolvedDriverID}_${formattedScheduledTime}`;
            if (excelDuplicateDriverSet.has(fileDriverKey)) {
              formatErrors.push(
                `Row ${
                  index + 2
                }: Driver '${formattedDriver}' is assigned to multiple trips in this file for the same date/shift.`,
              );
            } else {
              excelDuplicateDriverSet.add(fileDriverKey);
            }

            const occupancyKey = `${resolvedDriverID}_${formattedDate}_${formattedScheduledTime}`;
            if (occupiedDriverSet.has(occupancyKey)) {
              driverOccupiedErrors.push(
                `Row ${
                  index + 2
                }: Driver '${formattedDriver}' is already assigned to another trip for this date/shift.`,
              );
            }
          }
        }

        // if (formattedVehicle) {
        //   const key = `${formattedVehicle}_${formattedVendorCode}`;
        //   const cab = cabMap.get(key);

        //   if (!cab) {
        //     formatErrors.push(
        //       `Row ${
        //         index + 2
        //       }: Invalid Vehicle '${formattedVehicle}' for Vendor '${formattedVendorCode}'`,
        //     );
        //   } else {
        //     const vehicleSeats = Number(cab.cab?.noOfSeats);
        //     const tripSeats = Number(seats);

        //     if (vehicleSeats < tripSeats) {
        //       formatErrors.push(`Row ${index + 2}: Vehicle seats insufficient`);
        //     }
        //   }
        // }

        // -----------------------------------------------------
        // CAB validation (existence, seats, in-file duplicate, occupancy)
        // -----------------------------------------------------
        let resolvedCabID: any;
        if (formattedVehicle) {
          const key = `${formattedVehicle}_${formattedVendorCode}`;
          const cab = cabMap.get(key);
          if (!cab) {
            formatErrors.push(
              `Row ${
                index + 2
              }: Invalid Vehicle '${formattedVehicle}' for Vendor '${formattedVendorCode}'`,
            );
          } else {
            resolvedCabID = cab.cabID;

            const vehicleSeats = Number(cab.cab?.noOfSeats);
            const tripSeats = Number(seats);
            if (vehicleSeats < tripSeats) {
              seatErrors.push(`Row ${index + 2}: Vehicle seats insufficient`);
            }

            const fileCabKey = `${resolvedCabID}_${formattedScheduledTime}`;
            if (excelDuplicateCabSet.has(fileCabKey)) {
              formatErrors.push(
                `Row ${
                  index + 2
                }: Vehicle '${formattedVehicle}' is assigned to multiple trips in this file for the same date/shift.`,
              );
            } else {
              excelDuplicateCabSet.add(fileCabKey);
            }

            const occupancyKey = `${resolvedCabID}_${formattedDate}_${formattedScheduledTime}`;
            if (occupiedCabSet.has(occupancyKey)) {
              cabOccupiedErrors.push(
                `Row ${
                  index + 2
                }: Vehicle '${formattedVehicle}' is already assigned to another trip for this date/shift.`,
              );
            }
          }
        }

        if (
          formattedCabArrivalTime &&
          !timeFormat.test(formattedCabArrivalTime)
        ) {
          formatErrors.push(
            `Row ${index + 2}: Invalid Cab Arrival Time '${
              row['Cab Arrival Time']
            }' (should be 'HH:MM').`,
          );
        }

        row.driverID = resolvedDriverID ?? null;
        row.cabID = resolvedCabID ?? null;

        validatedData.push({ row });
      }

      // If any errors, combine and throw
      const allErrors = [
        ...employeeErrors,
        ...formatErrors,
        ...invalidVendors,
        ...excelDuplicateErrors,
        ...driverOccupiedErrors,
        ...cabOccupiedErrors,
        ...seatErrors,
      ];
      if (allErrors.length > 0) {
        throw new BadRequestException(`\n${allErrors.join('\n')}`);
      }

      // return validatedData;
      return { rows: validatedData, cabArrivalTimeProvided };
    } catch (err) {
      throw new BadRequestException(`${err.message}`);
    }
  }

  async completeTrip(
    tripInput: CompleteTripDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    const transaction = await this.sequelize.transaction();
    try {
      const tripID = tripInput?.tripID;
      // ✅ 1. Validate tripID
      if (!tripID) {
        throw new BadRequestException('Trip ID is required');
      }

      // ✅ 2. Find trip and validate it exists
      const tripData = await this.findOne(parseInt(tripID));
      if (!tripData) {
        throw new NotFoundException('Trip not found');
      }

      // ✅ 3. Validate trip status
      if (tripData.status === TripStatus.Completed) {
        throw new BadRequestException('Trip already completed');
      }

      if (tripData.status !== TripStatus.Ongoing) {
        throw new BadRequestException('Only ongoing trips can be completed');
      }

      // ✅ 4. GPS Server call with better error handling
      let totalKM = 0;
      try {
        const apiUrl = this.configService.get('GPS_SERVER_API_URL');
        const GPS_API_KEY = this.configService.get('GPS_SERVER_API_KEY');

        const apiResponse = await axios.get(
          `${apiUrl}/geocode/getTipLocations?tripId=${tripID}`,
          {
            headers: { 'gps-api-key': GPS_API_KEY },
            timeout: 10000, // 10 second timeout
          },
        );
        const geocodesArray = apiResponse?.data?.data;
        let totalDistance = 0;

        if (geocodesArray?.length >= 2) {
          for (let i = 0; i < geocodesArray.length - 1; i++) {
            const [lat1, lon1] = geocodesArray[i]?.geocode
              .split(',')
              .map(Number);
            const [lat2, lon2] = geocodesArray[i + 1]?.geocode
              .split(',')
              .map(Number);

            const segmentDistance =
              await this.googleMapService.haversineDistance(
                lat1,
                lon1,
                lat2,
                lon2,
              );
            totalDistance += segmentDistance;
          }
        }
        totalKM = Number(totalDistance.toFixed(2));
      } catch (gpsError) {
        // Continue without GPS data - this is acceptable for trip completion
      }

      // ✅ 5. Update trip actuals
      if (totalKM && totalKM !== 0) {
        await this.tripActualService.calculateTripActuals(
          tripData,
          totalKM,
          parseInt(tripID),
          user,
        );
      } else {
        await this.tripActualService.update(
          parseInt(tripID),
          totalKM,
          0,
          null,
          user,
        );
      }

      // ✅ 6. Handle no-show marking with improved logic
      const tripRequestIDs = tripData?.employees
        ?.map((emp) => emp.tripRequestID)
        ?.filter((id) => id); // Remove null/undefined IDs

      const currentTime = moment().format('HH:mm:ss');
      let updatedEmployees = [...(tripData.employees || [])];

      if (tripRequestIDs && tripRequestIDs.length > 0) {
        const tripRequests = await this.tripRequestModel.findAndCountAll({
          where: {
            id: tripRequestIDs,
            status: { [Op.ne]: Status.EmployeeSelfNoShow },
            [Op.or]: [{ attendance: false }, { attendance: null }],
          },
          attributes: ['id', 'employeeID'],
          transaction,
        });

        const noAttendanceRequests = tripRequests?.rows || [];

        if (noAttendanceRequests.length > 0) {
          // Update TripRequest model for no-show employees
          await this.tripRequestModel.update(
            {
              noShow: true,
              attendance: false,
              attendanceTime: currentTime,
              attendanceMode: null,
            },
            {
              where: {
                id: {
                  [Op.in]: noAttendanceRequests.map((req) => req.id),
                },
              },
              transaction,
            },
          );

          // Update employees array in trip data
          updatedEmployees = updatedEmployees.map((emp) => {
            const isNoShow = noAttendanceRequests.some(
              (req) => req.employeeID.toString() === emp.id.toString(),
            );

            if (isNoShow) {
              return {
                ...emp,
                noShow: true,
                attendance: false,
                attendanceTime: currentTime,
                attendanceMode: null,
              };
            }
            return emp;
          });

          // Create event logs for no-show employees
          for (const request of noAttendanceRequests) {
            const eventLog = {
              objectType: 'Trip Request',
              changeType: 'edit',
              objectID: request.id,
              authID: user.id,
              orgID: user.orgID,
              updatedBy: user.name,
              payload: { noShow: true, attendance: false },
              requestPayload: { tripRequestID: request.id },
              customDescription: 'marked as no show during trip completion',
              user,
            };
            await this.eventlogService.create(eventLog);
          }
        }
      }

      // ✅ 7. Complete the trip with updated employees array
      const [, updatedRows] = await this.tripModel.update(
        {
          status: TripStatus.Completed,
          employees: updatedEmployees,
        },
        {
          where: { id: parseInt(tripID) },
          returning: true,
          transaction,
        },
      );

      // ✅ 8. Create event log for trip completion
      const eventPayload = {
        tripID: parseInt(tripID),
        status: TripStatus.Completed,
        completedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
      };
      // Was payload: updatedRows[0] — the full raw trip record, dumping
      // every column. Trimmed to just tripID (compulsory) plus driver
      // name / cab regNo, sourced from tripData's associations (already
      // fetched via findOne() above) rather than updatedRows[0], which
      // is the raw model update result with no associations attached.
      const eventLog = {
        objectType: 'Trip',
        changeType: 'edit',
        objectID: updatedRows[0].id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: {
          tripID: updatedRows[0].id,
          driverName: tripData.driver?.name ?? 'N/A',
          cabRegNo: tripData.cab?.regNo ?? 'N/A',
        },
        requestPayload: eventPayload,
        customDescription: 'completed trip manually',
        user,
      };
      await this.eventlogService.create(eventLog);

      await transaction.commit();

      return {
        message: 'Trip completed successfully',
        data: updatedRows[0],
      };
    } catch (error: any) {
      await transaction.rollback();
      this.logger.error('Error completing trip:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to complete trip');
    }
  }

  /**
   * Audit trail for a trip and its billing row.
   *
   * Two objectType/objectID pairs are needed: trip mutations are logged as
   * ('Trip', tripID) while billing mutations are logged as
   * ('Trip Actuals', tripActual.id) - see trip-actuals.service update(). A
   * tripID-only filter would return no billing rows at all.
   *
   * EventLog rows live in monthly tables. A post-completion edit lands in the
   * month the EDIT happens, not the month the trip ran, so the window is the
   * trip's own month (for the completion row) plus the current and previous
   * month (for edit rows).
   */
  async getTripEditHistory(
    tripID: number,
    user: any,
    skip = 0,
    take = 50,
  ): Promise<{
    items: any[];
    totalItems: number;
    searchedWindow: any;
    reason: string | null;
  }> {
    try {
      // Org-scoped: a trip outside the caller's org is reported as not found,
      // so this cannot be used to probe other tenants' audit rows.
      //
      // SuperAdmin is exempt: it carries no orgID (auth.service.ts:1135
      // "undefined for SuperAdmin only"), and `orgID: undefined` in a where
      // clause makes Sequelize throw rather than match. Same exemption shape as
      // role.service.ts:60-63. A SuperAdmin that can edit billing must be able
      // to read the audit trail of that edit.
      const isSuperAdmin = user?.userType === UserType.SuperAdmin;
      const tripWhere: any = { id: tripID };
      if (!isSuperAdmin) {
        // Explicit presence check, not truthiness - orgID 0 would be valid, and
        // undefined here would be a 500 from Sequelize instead of a 404.
        if (user?.orgID === undefined || user?.orgID === null) {
          throw new NotFoundException('Trip not found');
        }
        tripWhere.orgID = user.orgID;
      }
      const trip = await this.tripModel.findOne({ where: tripWhere });
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }

      const tripActual =
        await this.tripActualService.findTripActualDataWithTripID(
          tripID.toString(),
        );

      const targets: Array<{ objectType: string; objectID: any }> = [
        { objectType: 'Trip', objectID: tripID },
      ];
      if (tripActual) {
        targets.push({
          objectType: 'Trip Actuals',
          objectID: tripActual.id,
        });
      }

      // Lower-cased three-letter token, matching how the writer builds the
      // table name in eventlogDynamicModel.getTableName().
      const months: Array<{ month: string; year: string }> = [];
      const addMonth = (value: any) => {
        const parsed = moment(value);
        if (!parsed.isValid()) {
          return;
        }
        const entry = {
          month: parsed.format('MMM').toLowerCase(),
          year: parsed.format('YYYY'),
        };
        const exists = months.some(
          (m) => m.month === entry.month && m.year === entry.year,
        );
        if (!exists) {
          months.push(entry);
        }
      };

      // An edit lands in the month the EDIT happens, not the month the trip
      // ran, so every month from the trip to today is in play - not just the
      // trip month plus two. Walk newest-first from the current month back to
      // the trip's own month.
      const MAX_MONTHS = 12;
      const tripMonthStart =
        trip.date && moment(trip.date).isValid()
          ? moment(trip.date).startOf('month')
          : null;
      // Floor is the EARLIER of the trip month and last month, so the window is
      // always a superset of the one this method used to search. Last month
      // stays in even for a trip dated this month: trips are created ahead of
      // the date they run, so the 'add' row for an August trip can sit in the
      // July table. It is also the fallback when strictNullChecks-off lets a
      // null/unparseable Trip.date through and there is no trip month to walk to.
      const previousMonthStart = moment().subtract(1, 'month').startOf('month');
      // Cloned, not aliased: tripMonthStart is read again below, and a future
      // edit that mutated walkFloor in place would silently corrupt it.
      const walkFloor =
        tripMonthStart && tripMonthStart.isBefore(previousMonthStart)
          ? tripMonthStart.clone()
          : previousMonthStart.clone();

      const cursor = moment().startOf('month');
      while (months.length < MAX_MONTHS) {
        addMonth(cursor);
        if (cursor.isSameOrBefore(walkFloor, 'month')) {
          break;
        }
        cursor.subtract(1, 'month');
      }

      // The trip's own month carries the completion row and is the one month
      // guaranteed to hold rows, so it must survive the cap on a trip older
      // than MAX_MONTHS. Drop the oldest walked month to make room. addMonth
      // dedupes, so this is a no-op whenever the walk already reached it.
      if (tripMonthStart) {
        if (months.length >= MAX_MONTHS) {
          months.pop();
        }
        addMonth(tripMonthStart);
      }

      const orgIDForQuery = isSuperAdmin ? null : user.orgID;
      const monthsToSearch = months.slice(0, MAX_MONTHS);

      const history = await this.eventlogService.getObjectHistory(
        targets,
        monthsToSearch,
        // undefined for SuperAdmin - that switches the predicate off entirely,
        // which is the correct cross-org semantic.
        { skip, take, orgID: orgIDForQuery },
      );

      // `reason` is always the description of the single most recent edit
      // across full history, independent of the requested page. When skip=0,
      // history.items[0] already is that row (getObjectHistory sorts the full
      // merged set before paginating) - no extra query needed. For any other
      // page, issue one cheap skip:0/take:1 lookup to fetch it directly.
      let reason: string | null = null;
      if (skip === 0) {
        reason = history.items[0]?.description ?? null;
      } else {
        const latest = await this.eventlogService.getObjectHistory(
          targets,
          monthsToSearch,
          { skip: 0, take: 1, orgID: orgIDForQuery },
        );
        reason = latest.items[0]?.description ?? null;
      }

      return {
        items: history.items,
        totalItems: history.totalItems,
        searchedWindow: {
          monthsSearched: (history.monthsSearched || []).map((name: string) =>
            name.replace('EventLogs_', ''),
          ),
          tripMonth: trip.date
            ? moment(trip.date).format('MMM_YYYY').toLowerCase()
            : null,
          note:
            'Searched every month from the trip month to the current month, ' +
            'capped at the 12 most recent (the trip month is always included).',
        },
        reason,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Resolves the trip a billing-side edit targets, applying the org scope.
   *
   * Same shape as getTripEditHistory above: a trip outside the caller's org is
   * reported as not found rather than 403, so this cannot be used to probe
   * other tenants. SuperAdmin carries no orgID (auth.service.ts:1135) and is
   * exempt, otherwise `orgID: undefined` in the where clause would throw.
   */
  private async findTripForBillingEdit(tripID: any, user: any): Promise<Trip> {
    const isSuperAdmin = user?.userType === UserType.SuperAdmin;
    const where: any = { id: tripID };
    if (!isSuperAdmin) {
      // Explicit presence check, not truthiness - orgID 0 would be valid, and
      // undefined here is a Sequelize 500 rather than a 404.
      if (!isPresent(user?.orgID)) {
        throw new NotFoundException('Trip not found');
      }
      where.orgID = user.orgID;
    }
    const trip = await this.tripModel.findOne({ where });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    return trip;
  }

  /**
   * Read-only rehearsal of the billing recalculation.
   *
   * There is no transaction around this edit: TripActualsService.update() owns
   * its own save and takes no transaction arg, and threading one through would
   * change the signature completeTrip and startTrip share. So this pre-flight is
   * the only thing standing between a rate failure and a half-applied edit. It
   * reproduces EVERY way calculateTripActuals can throw, before Trip is written,
   * and turns each into a 400 that explains itself.
   *
   * Zero side effects: getVehicleBillingRate is a findOne, the slab test is an
   * in-memory scan, and nothing here reaches TripActualsService.update() - the
   * sole writer of tripActual.save() and the sole emitter of its EventLog.
   *
   * It is handed the NEW vendorID, the same value the real recalc reads off the
   * updated trip, so the dry run and the real run cannot disagree.
   */
  private async preflightBillingRecalculation(
    newVendorID: any,
    trip: Trip,
    tripActual: TripActual,
    spockOnTrip: boolean,
  ): Promise<void> {
    // A spock-only edit on a trip that never had a vendor cannot be priced: the
    // rate lookup would search for vendorID IS NULL, miss, and report "the
    // selected vendor has no billing rate" - naming a vendor the admin never
    // selected. Fail with something actionable instead.
    if (!isPresent(newVendorID)) {
      throw new BadRequestException(
        'This trip has no vendor assigned, so its cost cannot be recalculated. Assign a vendor before changing the escort.',
      );
    }

    // Mirrors the guard in calculateTripActuals: the recalc falls back to the
    // stored distance when no totalKM is passed, and rejects a blank one rather
    // than writing the string "NaN" into a VARCHAR money column. Gate on the RAW
    // value - Number(null) and Number('') are both 0, so coercing first would
    // let an unset distance recompute to a cost of zero.
    const rawKM = tripActual?.actualDistance;
    const effectiveKM = Number(rawKM);
    if (
      !isPresent(rawKM) ||
      String(rawKM).trim() === '' ||
      !Number.isFinite(effectiveKM)
    ) {
      throw new BadRequestException(
        'actualDistance is required to recalculate the trip cost.',
      );
    }

    let billingRate: any;
    try {
      billingRate =
        await this.billingConfigurationService.getVehicleBillingRate(
          newVendorID,
          trip.orgID,
          trip.seats,
        );
    } catch (error) {
      // getVehicleBillingRate throws NotFound when the vendor has no row for
      // this seat count. Surfacing that as a 404 would read as "trip not found";
      // it is a rejected input, so it becomes a 400 naming the seat count the
      // admin has to configure.
      if (error?.status === 404) {
        throw new BadRequestException(
          `The selected vendor has no billing rate configured for this trip's seat count (${trip.seats} seats).`,
        );
      }
      throw error;
    }

    // Multi-slab plans throw a SECOND NotFound from inside calculateTripActuals
    // when no slab covers the distance. Reproduced here with the identical
    // comparison (effectiveKM >= item.minDistance && effectiveKM <=
    // item.maxDistance) so a boundary value cannot pass the dry run and fail the
    // real one.
    if (billingRate?.billingPlan === BillingPlans.PerTripMultiSlabBilling) {
      // multiSlabRates is JSONB allowNull:true (billing-rate.model.ts:71-74) and
      // billingPlan is an ENUM, so a row can legitimately say multi-slab while
      // holding a NULL slab list. The real code dereferences it WITHOUT a guard
      // (trip-actuals.service.ts:189), so a null there is a raw TypeError -> no
      // .status -> a bare 500 AFTER Trip has already been written. Treat a
      // non-array as a pre-flight REJECTION, never as a reason to skip the
      // check: skipping here is what would let the trip commit and the billing
      // row go stale.
      if (!Array.isArray(billingRate?.multiSlabRates)) {
        throw new BadRequestException(
          "The selected vendor's multi-slab billing plan has no distance slabs configured.",
        );
      }
      const slab = billingRate.multiSlabRates.find(
        (item) =>
          effectiveKM >= item.minDistance && effectiveKM <= item.maxDistance,
      );
      if (!slab) {
        throw new BadRequestException(
          `The selected vendor's billing plan has no distance slab covering this trip's ${effectiveKM} km.`,
        );
      }

      // multiSlabRates is unvalidated JSONB - no DTO validates its shape, and
      // the FE writes slab figures from a text field, so `rate` and
      // `securityAmount` can arrive as STRINGS. calculateTripActuals then does
      // `billingRange.rate + billingRange.securityAmount`
      // (trip-actuals.service.ts:198), which on strings CONCATENATES:
      // "500" + "100" = "500100", stored happily into the VARCHAR actualCost.
      // That is silent corruption, not a throw, so it would sail past every
      // other check here and bill the org 500100 instead of 600.
      if (!Number.isFinite(Number(slab.rate))) {
        throw new BadRequestException(
          "The selected vendor's billing slab has a non-numeric rate. Fix the billing configuration before reassigning this trip.",
        );
      }
      // securityAmount is only read when the trip carries an escort, so it is
      // only required to be numeric in that case. It is nullable in the FE
      // schema, so absent is fine - null is coerced to 0 by Number().
      if (spockOnTrip && isPresent(slab.securityAmount)) {
        if (!Number.isFinite(Number(slab.securityAmount))) {
          throw new BadRequestException(
            "The selected vendor's billing slab has a non-numeric security amount. Fix the billing configuration before changing the escort.",
          );
        }
      }
    }
  }

  /**
   * Corrects who ran an already-Completed trip, from the Trip Billing Report
   * detail page: vendor + driver + cab as a set, and/or the security escort.
   *
   * Deliberately NOT built on assignCabAndDriver or assignVendor:
   *  - assignCabAndDriver writes `X || null`, so an omitted field wipes the
   *    stored one, and it must keep working on Pending trips - it cannot take a
   *    Completed-only gate.
   *  - assignVendor requires lockStatus === 'Active' and nulls cabID/driverID
   *    whenever the vendor changes, the opposite of what is needed here.
   *
   * lockStatus is deliberately not read: a Completed trip is normally locked and
   * must still be correctable.
   *
   * No transaction, for the reason given on preflightBillingRecalculation.
   * Order is: validate -> pre-flight (read-only) -> Trip write -> recalc ->
   * EventLog. Same exposure as slice 1 and as assignVendor; the pre-flight
   * closes it for every known rate failure.
   */
  async updateBillingTripAssignment(
    dto: BillingTripAssignmentDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    try {
      // No isSuperAdmin branch in this method: tenancy is enforced once, by
      // findTripForBillingEdit resolving the trip, and every entity lookup below
      // then scopes to that trip's own orgID. A SuperAdmin exemption on the
      // entity lookups would have let org B's vendor/cab/driver/security be
      // written onto org A's trip.

      // @IsNotEmpty passes a whitespace-only string, so re-check the trimmed
      // value. The reason is the whole audit justification for the edit.
      const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
      if (reason === '') {
        throw new BadRequestException('A non-empty reason is required.');
      }

      const trip = await this.findTripForBillingEdit(dto.tripID, user);

      if (trip.status !== TripStatus.Completed) {
        throw new BadRequestException(
          `Only a Completed trip can be edited here. This trip is ${trip.status}.`,
        );
      }

      // Built incrementally: a field absent from the body is never added, so
      // tripModel.update never sees it and the stored value survives. This is
      // the deliberate break from assignCabAndDriver's `X || null`.
      const changes: any = {};
      let vendorChanged = false;
      let spockChanged = false;

      // Every entity lookup below is scoped to trip.orgID, NOT user.orgID.
      // The trip is already resolved and its org is authoritative, so the checks
      // hold identically for an ordinary admin (whose user.orgID equals it, via
      // findTripForBillingEdit) and for a SuperAdmin (who carries no orgID at
      // all). Scoping to user.orgID and exempting SuperAdmin - as an earlier
      // draft did - left SuperAdmin able to attach org B's vendor, cab, driver
      // or security guard to org A's trip.
      const tripOrgID = trip.orgID;

      // driverID/cabID only mean anything alongside a vendorID. Rejecting rather
      // than ignoring them: a 200 that silently discarded a driver change would
      // leave the admin believing it took effect.
      if (
        !isPresent(dto.vendorID) &&
        (isPresent(dto.driverID) || isPresent(dto.cabID))
      ) {
        throw new BadRequestException(
          'driverID and cabID require vendorID - vendor, driver and cab change together.',
        );
      }

      if (isPresent(dto.vendorID)) {
        // Vendor, driver and cab move as a set. The FE blocks this too, but a
        // partial set would leave a cab from the old vendor on the new one.
        if (!isPresent(dto.driverID) || !isPresent(dto.cabID)) {
          throw new BadRequestException(
            'driverID and cabID are required when changing the vendor.',
          );
        }

        const vendor = await this.vendorModel.findOne({
          where: { id: dto.vendorID },
        });
        if (!vendor) {
          throw new BadRequestException('Vendor not found.');
        }

        // Vendor has no orgID column - the org link lives in
        // VendorOrganizations - so it is checked separately from the findOne.
        const vendorLink = await this.vendorRequestModel.findOne({
          where: {
            vendorID: dto.vendorID,
            orgID: tripOrgID,
            requestStatus: RequestStatus.Approved,
          },
        });
        if (!vendorLink) {
          throw new BadRequestException(
            "The selected vendor is not linked to this trip's organization.",
          );
        }

        // Ownership. Two independent status axes:
        //   - the org-LINK row must be Status.Approved (live data holds only
        //     Approved/Pending/Rejected; only Approved may run this org's trips)
        //   - the ENTITY itself must be Status.Active (Cab.status
        //     cab.model.ts:116, Driver.status driver.model.ts:73) - an Inactive
        //     cab must not be assignable even when its link is approved.
        // Cab.vendorID is additionally asserted on the nested Cab include below
        // - cabs are not shared across vendors in this data (0/128 trips show a
        // cab-vendor mismatch), so the scalar and the join row always agree.
        // Driver.vendorID is NOT asserted the same way: a driver may legitimately
        // work for more than one vendor, so Driver.vendorID is a single-valued
        // scalar that cannot represent that. OrganizationDrivers (driverID +
        // vendorID + orgID + status: Approved) is the authoritative many-to-many
        // relationship and is what proves this driver belongs to this vendor.
        // NOT identical to the dropdown queries below: this preflight scopes
        // to orgID: tripOrgID unconditionally, while listBillingEditDrivers'
        // dropdown (:5017-5030) drops the org filter entirely for SuperAdmin
        // (`...(isSuperAdmin ? {} : { orgID: user.orgID })`). The two coincide
        // for an ordinary admin and diverge for SuperAdmin - a known gap in
        // the dropdown, tracked separately, not fixed here.
        //
        // Only re-validated when the cab or the vendor is actually changing.
        // Live data holds 59 Completed trips whose stored driverID/cabID
        // predate an ownership check (bulkAssignCabAndDriver wrote them with
        // none) and would fail this lookup today even though the admin isn't
        // touching that field. Re-submitting an unchanged id must not force a
        // fresh ownership proof; changing the vendor must still force one on
        // every entity, including one whose id is otherwise unchanged.
        const cabUnchanged =
          String(dto.cabID) === String(trip.cabID) &&
          String(dto.vendorID) === String(trip.vendorID);
        if (!cabUnchanged) {
          const cabLink = await this.orgCabModel.findOne({
            where: {
              cabID: dto.cabID,
              vendorID: dto.vendorID,
              status: Status.Approved,
              orgID: tripOrgID,
            },
            include: [
              {
                model: Cab,
                as: 'cab',
                // vendorID asserted inside the nested where rather than
                // compared after the fact, so a stale join row cannot let a
                // cross-vendor cab through.
                where: { status: Status.Active, vendorID: dto.vendorID },
                required: true,
              },
            ],
          });
          if (!cabLink) {
            throw new BadRequestException(
              'The selected cab is not an active cab belonging to the selected vendor.',
            );
          }
        }

        const driverUnchanged =
          String(dto.driverID) === String(trip.driverID) &&
          String(dto.vendorID) === String(trip.vendorID);
        if (!driverUnchanged) {
          const driverLink = await this.orgDriverModel.findOne({
            where: {
              driverID: dto.driverID,
              vendorID: dto.vendorID,
              status: Status.Approved,
              orgID: tripOrgID,
            },
            include: [
              {
                model: Driver,
                as: 'driver',
                // No vendorID assertion here - OrganizationDrivers (the where
                // above) is the authoritative vendor relationship. A driver may
                // serve multiple vendors, so Driver.vendorID is only ever one
                // of them and must not be re-checked against dto.vendorID.
                where: { status: Status.Active },
                required: true,
              },
            ],
          });
          if (!driverLink) {
            throw new BadRequestException(
              'The selected driver is not an active driver belonging to the selected vendor.',
            );
          }
        }

        vendorChanged = String(trip.vendorID) !== String(dto.vendorID);

        changes.vendorID = dto.vendorID;
        // Derived from Vendor.code, never from the body: dto.vendorCode is
        // accepted by the DTO but ignored, so the stored code cannot drift from
        // the stored vendorID the way assignCabAndDriver allows.
        changes.vendorCode = vendor.code;
        changes.driverID = dto.driverID;
        changes.cabID = dto.cabID;
      }

      // The ENTIRE security block is gated on spock being PRESENT.
      // isPresent, not truthiness: `spock: false` is a real instruction (clear
      // the escort) that a truthy check would silently drop, and an ABSENT spock
      // is NOT false - it means "do not touch security", so spock/spockID/
      // spockCode keep their stored values.
      if (isPresent(dto.spock)) {
        if (dto.spock === false) {
          changes.spock = false;
          changes.spockID = null;
          changes.spockCode = null;
        } else {
          if (!isPresent(dto.spockID)) {
            throw new BadRequestException(
              'spockID is required when spock is true.',
            );
          }
          const security = await this.securityModel.findOne({
            where: {
              id: dto.spockID,
              orgID: tripOrgID,
              // Held to the same bar as Cab and Driver: an Inactive guard must
              // not be assignable, and on a multi-slab plan would be billed for.
              status: Status.Active,
            },
          });
          if (!security) {
            throw new BadRequestException(
              "The selected security is not an active guard in this trip's organization.",
            );
          }
          changes.spock = true;
          changes.spockID = dto.spockID;
          // Derived server-side so the code can never point at a different
          // person than spockID does. The DTO has no spockCode field at all.
          changes.spockCode = security.securityCode;
        }
      }

      // spock is a BILLING INPUT, not just a roster field: on a multi-slab plan
      // calculateTripActuals adds billingRange.securityAmount when tripData.spock
      // is true (trip-actuals.service.ts:197-199). So a security change alters
      // the correct bill and MUST trigger a recalculation - gating recalc on
      // vendorChanged alone would leave the org under-billed when an escort is
      // added and over-billed when one is removed, with nothing in the audit
      // trail saying so.
      if (isPresent(dto.spock)) {
        spockChanged = Boolean(trip.spock) !== Boolean(dto.spock);
      }

      if (Object.keys(changes).length === 0) {
        throw new BadRequestException(
          'Supply the vendor set (vendorID + driverID + cabID) and/or spock.',
        );
      }

      const tripActual =
        await this.tripActualService.findTripActualDataWithTripID(
          String(dto.tripID),
        );

      // Captured BEFORE the recalc overwrites them in place. These are the only
      // record of what the trip was billed at under the old vendor.
      const previousActualCost = tripActual?.actualCost ?? null;
      const previousBillingRate = tripActual?.billingRate ?? null;

      // Either a vendor change or a security change alters the correct bill.
      const billingInputChanged = vendorChanged || spockChanged;

      // An overridden cost is pinned, so no rate is needed and no recalc runs -
      // which means a vendor with no rate row for this seat count must still be
      // assignable. Skipping the pre-flight here is what makes that work;
      // running it would block a valid edit.
      let shouldRecalculate =
        billingInputChanged &&
        !!tripActual &&
        tripActual.isCostOverridden !== true;

      // PerKMBilling has no escort-surcharge term (trip-actuals.service.ts:175-177)
      // and TripActual.securityAmount is unconditionally zeroed on every PerKM
      // recalc regardless (trip-actuals.service.ts:167, 219-232, 300-302) - so
      // when the ONLY billing-relevant change is the escort toggle (no vendor
      // change) and the trip's current plan is PerKMBilling, recalculating
      // cannot change the bill and would only re-price the whole trip against
      // TODAY's rate card (getVehicleBillingRate has no date pinning -
      // billing-configuration.service.ts:182-203). Resolved only in this narrow
      // case, from data already in scope (trip.vendorID/orgID/seats) - no extra
      // Trip fetch. A missing or erroring lookup falls through to the existing
      // recalc path unchanged; preflightBillingRecalculation below re-attempts
      // the same lookup and raises a proper error if the rate is genuinely gone.
      let skipRecalcForPerKmSpockOnly = false;
      if (shouldRecalculate && !vendorChanged && spockChanged) {
        let currentBillingRate: any = null;
        try {
          currentBillingRate =
            await this.billingConfigurationService.getVehicleBillingRate(
              trip.vendorID,
              trip.orgID,
              trip.seats,
            );
        } catch {
          currentBillingRate = null;
        }
        if (currentBillingRate?.billingPlan === BillingPlans.PerKMBilling) {
          shouldRecalculate = false;
          skipRecalcForPerKmSpockOnly = true;
        }
      }

      if (shouldRecalculate) {
        // The vendor the rate will actually be looked up under: the new one when
        // the vendor is changing, otherwise the trip's existing vendor (a
        // spock-only edit still re-derives the cost, under the same vendor).
        const recalcVendorID = isPresent(dto.vendorID)
          ? dto.vendorID
          : trip.vendorID;
        // The spock value the recalc will actually see: the request's when it
        // supplies one, otherwise the trip's current value. This is what decides
        // whether securityAmount gets added to the slab rate.
        const recalcSpock = isPresent(dto.spock)
          ? Boolean(dto.spock)
          : Boolean(trip.spock);
        // Read-only, and before any write: on failure nothing has been saved.
        await this.preflightBillingRecalculation(
          recalcVendorID,
          trip,
          tripActual,
          recalcSpock,
        );
      }

      const before = trip.get({ plain: true });

      const [, updatedRows] = await this.tripModel.update(changes, {
        where: { id: dto.tripID },
        returning: true,
      });
      const updatedTrip = updatedRows?.[0];
      if (!updatedTrip) {
        throw new NotFoundException('Trip not found');
      }

      const after = updatedTrip.get({ plain: true });

      let billingRecalcNote: string;
      if (shouldRecalculate) {
        billingRecalcNote = vendorChanged
          ? 'pending recalculation from the new vendor rate'
          : 'pending recalculation (security change affects the billed amount)';
      } else if (skipRecalcForPerKmSpockOnly) {
        billingRecalcNote =
          'skipped (PerKM plan has no escort surcharge to recalculate)';
      } else if (billingInputChanged && tripActual?.isCostOverridden === true) {
        billingRecalcNote = 'skipped (cost overridden)';
      } else if (billingInputChanged) {
        billingRecalcNote = 'skipped (no trip actual row)';
      }

      // Built explicitly rather than letting createChangeJson derive it: that
      // helper drops falsy new values, which would lose `spock: false` and a
      // cleared spockID. Same reasoning as slice 1's TripActual diff.
      const trackedFields = [
        'vendorID',
        'vendorCode',
        'driverID',
        'cabID',
        'spock',
        'spockID',
        'spockCode',
      ];
      const changeJSON: Record<string, any> = {};
      for (const field of trackedFields) {
        if (String(before[field]) !== String(after[field])) {
          changeJSON[field] = {
            OldValue: before[field],
            newValue: after[field],
          };
        }
      }
      if (billingRecalcNote) {
        changeJSON.billingRecalc = {
          OldValue: 'unchanged',
          newValue: billingRecalcNote,
        };
        // The pre-change figures, stored inline. The recalc below overwrites
        // TripActual.actualCost and .billingRate IN PLACE, so this row is the
        // only place the old basis survives.
        changeJSON.actualCost = {
          OldValue: previousActualCost,
          newValue: 'see the Trip Actuals entry for the recalculated figure',
        };
        changeJSON.billingRate = {
          OldValue: previousBillingRate,
          newValue: shouldRecalculate ? 'recalculated' : 'unchanged',
        };
      }
      changeJSON.reason = { OldValue: null, newValue: reason };

      // AUDIT BEFORE RECALC - deliberate ordering, not an oversight.
      // There is no transaction, so tripModel.update above is already committed.
      // If the recalculation below throws (a concurrent delete of the vendor's
      // BillingRate row between the pre-flight and here, or a concurrent delete
      // of the TripActual row), an EventLog write placed AFTER it would never
      // run - leaving a Completed trip permanently reassigned to a different
      // vendor/driver/cab with NO audit record at all. EventLog is the only
      // control in this domain, so the trip diff is recorded first and is
      // guaranteed to survive a recalc failure. The recalculated amount is
      // recorded separately by the 'Trip Actuals' log that update() emits.
      await this.eventlogService.create({
        objectType: 'Trip',
        changeType: 'edit',
        // Number, matching the ('Trip', parseInt(id)) target getTripEditHistory
        // queries with. The column is BIGINT so a string would coerce anyway,
        // but this makes both sides unambiguous.
        objectID: Number(dto.tripID),
        authID: user?.id,
        updatedBy: user?.name,
        payload: updatedTrip,
        requestPayload: dto,
        customDescription: `Billing assignment edited: ${reason}`,
        changeJSON,
        user,
      });

      // The actual recalculation. Reads vendorID/orgID/seats off the object it
      // is HANDED, not off a re-fetch, so passing the returned row is what makes
      // the new vendor's rate apply. It writes TripActual.actualCost and
      // .billingRate and emits its own 'Trip Actuals' EventLog entry, which
      // getTripEditHistory already queries alongside the 'Trip' entry above.
      //
      // remarks is passed as undefined on purpose: update() only overwrites
      // remarks when it is !== undefined, so an admin's billing remark survives.
      // The edit reason is audit data and must NOT land there.
      if (shouldRecalculate) {
        await this.tripActualService.calculateTripActuals(
          updatedTrip,
          null,
          Number(dto.tripID),
          user,
          undefined,
        );
      }

      return {
        message: 'Trip assignment updated',
        data: updatedTrip,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Vendors linked to the caller's org, for the billing-edit vendor dropdown.
   *
   * A new route is needed because /admin/vendor/vendor-list returns all vendors
   * MINUS those already linked to the org - the exact inverse - and
   * /admin/vendor (findAll) has no org scoping at all.
   */
  async listBillingEditVendors(user: any): Promise<PaginatedList<any>> {
    try {
      const isSuperAdmin = user?.userType === UserType.SuperAdmin;
      if (!isSuperAdmin && !isPresent(user?.orgID)) {
        return { items: [], totalItems: 0 };
      }
      const links = await this.vendorRequestModel.findAll({
        where: {
          requestStatus: RequestStatus.Approved,
          ...(isSuperAdmin ? {} : { orgID: user.orgID }),
        },
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name', 'code'],
            required: true,
          },
        ],
      });
      // Flattened so the FE does not depend on the join-table shape, and
      // de-duplicated by vendor id: for a SuperAdmin the orgID predicate is
      // dropped, so a vendor linked to twelve orgs would otherwise appear twelve
      // times with identical fields.
      const seen = new Set<string>();
      const items = [];
      for (const link of links as any[]) {
        const id = link.vendor?.id;
        if (!isPresent(id) || seen.has(String(id))) {
          continue;
        }
        seen.add(String(id));
        items.push({
          id,
          name: link.vendor?.name,
          code: link.vendor?.code,
        });
      }
      return { items, totalItems: items.length };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Drivers for one vendor within the caller's org.
   *
   * A new route is needed because DriverFilterInput declares vendorID but no
   * driver service ever reads it - every driver list filters on user.vendorID
   * from the token, which an org admin does not carry, so the filter is skipped
   * and all vendors' drivers come back.
   *
   * The two status axes match updateBillingTripAssignment's ownership check
   * exactly: link Approved, entity Active. Same filter as the tripsheet-upload
   * validation at :3812.
   */
  async listBillingEditDrivers(
    vendorID: number,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const isSuperAdmin = user?.userType === UserType.SuperAdmin;
      if (!isSuperAdmin && !isPresent(user?.orgID)) {
        return { items: [], totalItems: 0 };
      }
      const links = await this.orgDriverModel.findAll({
        where: {
          vendorID,
          status: Status.Approved,
          ...(isSuperAdmin ? {} : { orgID: user.orgID }),
        },
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code', 'phone'],
            // No vendorID assertion here - OrganizationDrivers (the where
            // above) is the authoritative vendor relationship. A driver may
            // serve multiple vendors, so Driver.vendorID is only ever one of
            // them and must not be re-checked against this dropdown's vendorID.
            // Asserting it here excluded exactly the drivers this route exists
            // to list: 122 Completed trips are correctly linked via a valid
            // Approved OrganizationDrivers row to a vendor other than the one
            // named in Driver.vendorID.
            where: { status: Status.Active },
            required: true,
          },
        ],
      });
      // De-duplicated by driver id: there is no unique index on
      // (driverID, orgID, vendorID) in 360-create-organizationDriver.js, so two
      // approved link rows for the same driver would list them twice.
      const seen = new Set<string>();
      const items = [];
      for (const link of links as any[]) {
        const id = link.driver?.id;
        if (!isPresent(id) || seen.has(String(id))) {
          continue;
        }
        seen.add(String(id));
        items.push({
          id,
          name: link.driver?.name,
          code: link.driver?.code,
          phone: link.driver?.phone,
        });
      }
      return { items, totalItems: items.length };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Cabs for one vendor within the caller's org. Same rationale as the driver
   * list: cab.service.ts:310 has vendorID explicitly commented out of its
   * filter, so no existing route can answer this.
   */
  async listBillingEditCabs(
    vendorID: number,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const isSuperAdmin = user?.userType === UserType.SuperAdmin;
      if (!isSuperAdmin && !isPresent(user?.orgID)) {
        return { items: [], totalItems: 0 };
      }
      const links = await this.orgCabModel.findAll({
        where: {
          vendorID,
          status: Status.Approved,
          ...(isSuperAdmin ? {} : { orgID: user.orgID }),
        },
        include: [
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo', 'noOfSeats', 'model'],
            // Same FK assertion as the driver list and the write-path check.
            where: { status: Status.Active, vendorID },
            required: true,
          },
        ],
      });
      // De-duplicated for the same reason as the driver list - no unique index
      // on (cabID, orgID, vendorID) in 350-create-organizationCab.js.
      const seen = new Set<string>();
      const items = [];
      for (const link of links as any[]) {
        const id = link.cab?.id;
        if (!isPresent(id) || seen.has(String(id))) {
          continue;
        }
        seen.add(String(id));
        items.push({
          id,
          regNo: link.cab?.regNo,
          noOfSeats: link.cab?.noOfSeats,
          model: link.cab?.model,
        });
      }
      return { items, totalItems: items.length };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Active security guards in the caller's org, for the billing-edit security
   * dropdown.
   *
   * GET /admin/security would answer the same question, but it is guarded by
   * 'Security-Read' - a key a billing-only role does not hold, which would 403
   * the dropdown for exactly the admins this feature is for. Same reasoning that
   * put the vendor/driver/cab lists here rather than on their own controllers.
   *
   * It also differs in one substantive way: security.service.ts:465-466 only
   * applies the Active filter when a `status` query param is supplied, so its
   * default list includes Inactive guards - which updateBillingTripAssignment
   * then rejects. This route filters Active unconditionally, so the dropdown and
   * the write-path check agree.
   *
   * Security is queried directly (no join table): it carries orgID via its
   * @BelongsTo, the same attribute security.service.ts filters on.
   */
  async listBillingEditSecurities(user: any): Promise<PaginatedList<any>> {
    try {
      const isSuperAdmin = user?.userType === UserType.SuperAdmin;
      if (!isSuperAdmin && !isPresent(user?.orgID)) {
        return { items: [], totalItems: 0 };
      }
      const securities = await this.securityModel.findAll({
        where: {
          status: Status.Active,
          ...(isSuperAdmin ? {} : { orgID: user.orgID }),
        },
        attributes: ['id', 'name', 'securityCode'],
      });
      // Deduped by id for consistency with the other three lists. Security has
      // no join table so duplicates are not expected here, but the shape is kept
      // identical so all four routes behave the same way.
      const seen = new Set<string>();
      const items = [];
      for (const security of securities as any[]) {
        const id = security?.id;
        if (!isPresent(id) || seen.has(String(id))) {
          continue;
        }
        seen.add(String(id));
        items.push({
          id,
          name: security?.name,
          securityCode: security?.securityCode,
        });
      }
      return { items, totalItems: items.length };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // ===========================================================================
  // Billing-edit: employee roster / attendance on a Completed trip
  // ===========================================================================
  //
  // Every write below shares one preamble - trimmed reason, org-scoped trip
  // resolution, Completed-only - and one epilogue: an EventLog 'Trip' entry with
  // an explicit changeJSON carrying the reason. None of them touch TripActual,
  // actualCost, actualDistance or Trip.status: employee edits have no billing
  // effect (calculateTripActuals reads only tripData/totalKM/billingRate, and
  // TripActual.actualOccupancy is never written anywhere in the codebase).

  /**
   * Shared preamble for every billing-edit employee write.
   *
   * Returns the resolved trip and the trimmed reason. findTripForBillingEdit
   * applies the org scope (and the SuperAdmin exemption), so every lookup after
   * this point scopes to trip.orgID rather than user.orgID.
   */
  private async assertBillingEditableTrip(
    tripID: any,
    rawReason: any,
    user: any,
  ): Promise<{ trip: Trip; reason: string }> {
    // @IsNotEmpty passes a whitespace-only string, so re-check the trimmed
    // value. The reason is the whole audit justification for the edit.
    const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (reason === '') {
      throw new BadRequestException('A non-empty reason is required.');
    }

    const trip = await this.findTripForBillingEdit(tripID, user);

    if (trip.status !== TripStatus.Completed) {
      throw new BadRequestException(
        `Only a Completed trip can be edited here. This trip is ${trip.status}.`,
      );
    }
    // lockStatus is deliberately not read: a Completed trip is normally locked
    // and must still be correctable.
    return { trip, reason };
  }

  /**
   * The stored roster, as a deep copy.
   *
   * A copy because calculateEmployeeEstTime MUTATES its input array in place and
   * calls employees.reverse() on the Pick branch
   * (employee-est-time-calculation.service.ts:37,47,55) - handing it the model
   * instance's own JSONB array would leave that array reversed or half-stamped
   * if it threw part-way through.
   */
  private cloneTripEmployees(trip: Trip): any[] {
    return Array.isArray(trip?.employees)
      ? JSON.parse(JSON.stringify(trip.employees))
      : [];
  }

  /**
   * Entries an admin has removed via billing-edit are kept in employees[] with a
   * removedByAdmin marker rather than spliced out, so the record survives. They
   * must be excluded from anything that treats the array as the live roster:
   * route geometry, ordering, occupancy.
   */
  private isActiveTripEmployee(emp: any): boolean {
    return emp?.removedByAdmin !== true;
  }

  /**
   * Trip.estimatedDistance is VARCHAR (trip.model.ts:163-164,
   * 328-create-trip.js:144-147) and every writer formats it as `${km} km`.
   *
   * The guard is the point: `undefined + ' km'` evaluates to the literal string
   * "undefined km", which the existing writers (trip.service.ts:2544, :2738,
   * :5438) will happily persist if Google Maps returns a malformed response.
   * Fail loudly instead of storing a corrupt distance on a billing-visible trip.
   */
  private formatEstimatedDistance(totalDistanceKm: any): string {
    if (
      !isPresent(totalDistanceKm) ||
      !Number.isFinite(Number(totalDistanceKm))
    ) {
      throw new BadRequestException(
        'The route distance could not be calculated for this trip. No changes were made.',
      );
    }
    return totalDistanceKm + ' km';
  }

  /**
   * Rejects a Google Maps response that failed WITHOUT failing loudly.
   *
   * This is the check the distance guard alone does not provide.
   * google-map-service.ts:89-91 builds legs from
   * `data.routes?.[0]?.legs?.map(...)` and accumulates distance inside that map,
   * so on ZERO_RESULTS / OVER_QUERY_LIMIT / REQUEST_DENIED - all of which come
   * back as HTTP 200 with an empty `routes` - `legs` is undefined and
   * totalDistance stays 0, yielding totalDistanceKm "0.00". "0.00" is finite, so
   * formatEstimatedDistance passes it straight through.
   *
   * Left unchecked that is not a crash, it is silent corruption of a
   * billing-visible record: on a Pick trip calculateEmployeeEstTime reads
   * `employeeLegs?.[index]` (:38,:44) so every duration resolves to 0, and the
   * trip would be committed with estimatedDistance "0.00 km" and an identical
   * bogus cabArrivalTime for the whole roster - with an EventLog entry recording
   * it as a legitimate admin edit. On a Drop trip `employeeLegs[index]` (:84) is
   * not optional-chained and throws a TypeError whose `.status` is undefined,
   * which the catch re-throws raw as a 500.
   *
   * Runs before any write, so a failed lookup leaves the trip untouched.
   */
  private assertUsableRoute(cabRouteResponse: any): void {
    const legs = cabRouteResponse?.legs;
    if (!Array.isArray(legs) || legs.length === 0) {
      throw new BadRequestException(
        'The route for this trip could not be calculated (the maps lookup returned no route). No changes were made.',
      );
    }
    if (Number(cabRouteResponse?.totalDistanceKm) <= 0) {
      throw new BadRequestException(
        'The route for this trip calculated to zero distance, which is not a usable route. No changes were made.',
      );
    }
  }

  /**
   * Recomputes route geometry and per-employee estimated times for a roster,
   * PRESERVING manually-edited cab arrival times.
   *
   * Shared by the add and reorder paths. Extracted from the block at
   * trip.service.ts:2486-2534 (updateEmployeeTrip) with two deliberate
   * deviations from the original:
   *
   *  1. every lookup is scoped to trip.orgID, not user.orgID. The original
   *     breaks for a SuperAdmin, who carries no orgID at all.
   *  2. entries flagged removedByAdmin are excluded from origin/waypoints/
   *     destination - they are no longer on the trip.
   *
   * MUST be called BEFORE the caller opens its transaction. It performs an
   * external Google Maps HTTP call (no DB transaction should be held open across
   * that), and calculateEmployeeEstTime does its own un-transactioned
   * TripRequest writes - see the note in updateBillingTripEmployeeAdd.
   */
  private async recomputeTripRoute(
    trip: Trip,
    activeEmployees: any[],
  ): Promise<{ employees: any[]; estimatedDistance: string; legs: any }> {
    // String(): organizationService.findOne takes `id: string`
    // (organization.service.ts:326-327) while Trip.orgID is bigint. The existing
    // callers pass user?.orgID, which is `any` off the JWT and so slips through
    // untyped; trip.orgID is properly typed and needs the explicit cast.
    const organization = await this.organizationService.findOne(
      String(trip.orgID),
    );

    const cabWaitingTimeConfig =
      await this.configurationService.getMultipleConfigValues(
        ['Cab waiting time'],
        { orgID: trip.orgID },
      );
    const { 'Cab waiting time': cabWaitingTimeBuffer } =
      cabWaitingTimeConfig?.data || {};

    const isPick = trip.pickDrop === PickDrop.Pick;

    let origin, destination, waypoints;
    if (isPick) {
      origin = activeEmployees[0]?.homepoint; // First employee
      waypoints = activeEmployees
        .slice(1)
        .map((emp) => emp.homepoint)
        .filter((point) => point); // Other employees
      destination = organization?.data?.geoCode; // Office
    } else {
      origin = organization?.data?.geoCode; // Office
      waypoints = activeEmployees
        .slice(0, activeEmployees.length - 1)
        .map((emp) => emp.homepoint)
        .filter((point) => point); // Employees
      destination = activeEmployees[activeEmployees.length - 1]?.homepoint; // Last employee
    }

    const cabRouteResponse = await this.googleMapService.calculateCabRoute(
      origin,
      destination,
      waypoints,
    );

    // Both validated before any write happens, so a bad Maps response cannot
    // reach the columns. assertUsableRoute must run FIRST - it catches the
    // silent-failure shape ("0.00" km with legs undefined) that the distance
    // guard alone passes straight through.
    this.assertUsableRoute(cabRouteResponse);
    const estimatedDistance = this.formatEstimatedDistance(
      cabRouteResponse?.totalDistanceKm,
    );

    // Distance-based buffer lookup, same shape as every other caller.
    const rawBuffer = await this.configurationService.getConfigValue(
      isPick ? 'Pick Buffer' : 'Drop Buffer',
      trip.orgID,
    );
    const bufferMinutes = getBufferForDistance(
      parseBufferConfig(rawBuffer),
      cabRouteResponse?.totalDistanceKm ?? 0,
    );
    const arrivalTimeBuffer = isPick ? bufferMinutes : 0;
    const dropTimeBuffer = isPick ? 0 : bufferMinutes;

    // Snapshot manual times BEFORE the call. calculateEmployeeEstTime overwrites
    // cabArrivalTime unconditionally (employee-est-time-calculation.service.ts
    // :47,55,87,95) and is shared by 13 call sites across trip.service.ts and
    // driver.trip.services.ts, so it is NOT modified by this slice. The marker
    // is honoured by snapshot-and-restore around it instead.
    const manualTimes = new Map<string, string>();
    for (const emp of activeEmployees) {
      if (
        emp?.cabArrivalTimeManual === true &&
        isPresent(emp?.cabArrivalTime)
      ) {
        manualTimes.set(String(emp.id), emp.cabArrivalTime);
      }
    }

    const employeesWithEstTime =
      await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
        trip.pickDrop,
        trip.shiftTime,
        cabRouteResponse?.legs,
        activeEmployees,
        String(arrivalTimeBuffer),
        String(dropTimeBuffer),
        String(cabWaitingTimeBuffer),
      );

    // Restore. Note the known limitation: the service chains each employee's
    // time off the PREVIOUS employee's cabArrivalTime (:52-57, :91-96), so
    // restoring afterwards means neighbours were derived from the estimate for
    // this employee, not from the manual value. The manual value is authoritative
    // for its own employee; neighbours keep coherent estimates among themselves.
    // Pre-seeding the chain would mean editing the shared service.
    for (const emp of employeesWithEstTime as any[]) {
      const kept = manualTimes.get(String(emp?.id));
      if (kept !== undefined) {
        emp.cabArrivalTime = kept;
        emp.cabArrivalTimeManual = true;
      }
    }

    return {
      employees: employeesWithEstTime,
      estimatedDistance,
      legs: cabRouteResponse?.legs,
    };
  }

  /**
   * Re-syncs TripRequest.pickUpTime / .dropTime for manually-timed employees.
   *
   * calculateEmployeeEstTime writes those columns itself
   * (employee-est-time-calculation.service.ts:60-67 / :98-105) using the value it
   * computed - the one recomputeTripRoute then discards in favour of the manual
   * one. Without this, employees[].cabArrivalTime (manual) and
   * TripRequest.pickUpTime (estimated) disagree after every add or reorder.
   *
   * Runs inside the caller's transaction.
   */
  private async syncManualCabTimesToTripRequests(
    trip: Trip,
    employees: any[],
    transaction: any,
  ): Promise<void> {
    const isPick = trip.pickDrop === PickDrop.Pick;
    for (const emp of employees) {
      if (
        emp?.cabArrivalTimeManual !== true ||
        !isPresent(emp?.cabArrivalTime) ||
        !isPresent(emp?.tripRequestID) ||
        // A removedByAdmin entry keeps its tripRequestID, but its TripRequest
        // was deliberately detached from this trip (tripID nulled on removal).
        // Rewriting its pickUpTime/dropTime would resurrect it on a trip it is
        // no longer part of.
        !this.isActiveTripEmployee(emp)
      ) {
        continue;
      }
      const [affectedCount] = await this.tripRequestModel.update(
        isPick
          ? { pickUpTime: emp.cabArrivalTime }
          : { dropTime: emp.cabArrivalTime },
        {
          // Scoped by employeeID and orgID as well as the primary key. The id
          // comes out of the Trip.employees[] JSON, which other paths overwrite
          // wholesale without validation (removeEmployeeFromTrips,
          // trip.service.ts:4741-4773), so a stale tripRequestID there would
          // otherwise write onto an arbitrary TripRequest row - potentially in
          // another organisation. Same scoping the prior art applies
          // (trip-request.service.ts:641-644).
          where: {
            id: emp.tripRequestID,
            employeeID: emp.id,
            orgID: trip.orgID,
          },
          transaction,
        },
      );
      // Asserted for the same reason the attendance write asserts: zero rows
      // means the employees[] entry carries a tripRequestID that does not belong
      // to this employee or this org, and committing anyway would leave
      // employees[].cabArrivalTime updated with TripRequest.pickUpTime/.dropTime
      // untouched - exactly the two-table drift this sync exists to prevent.
      // Throwing rolls the caller's Trip write back.
      if (affectedCount === 0) {
        throw new BadRequestException(
          `The linked trip request for employee ${emp?.id} could not be found, so their cab arrival time could not be synced. No changes were made.`,
        );
      }
    }
  }

  /**
   * The single audit call every billing-edit employee write ends with.
   *
   * changeJSON is built explicitly rather than letting createChangeJson derive
   * it: that helper drops falsy new values (eventlog.service.ts:192-194), which
   * would lose `attendance: false`, `present: false` and a cleared
   * attendanceMode. Same reasoning as slices 1 and 2.
   */
  private async logBillingEmployeeEdit(
    tripID: any,
    payload: any,
    requestPayload: any,
    changeJSON: Record<string, any>,
    description: string,
    reason: string,
    user: any,
  ): Promise<void> {
    // Defensive: this line and the object build below sit OUTSIDE the try, so a
    // null changeJSON from a future caller would TypeError here - after the
    // caller's transaction has already committed, which is the one place this
    // helper must never throw. Every current caller passes an object literal, so
    // this is unreachable today; it is guarded so it stays that way.
    if (!isPresent(changeJSON)) {
      changeJSON = {};
    }
    changeJSON.reason = { OldValue: null, newValue: reason };

    const eventLog = {
      objectType: 'Trip',
      changeType: 'edit',
      // Number, matching the ('Trip', parseInt(id)) target getTripEditHistory
      // queries with. The column is BIGINT so a string would coerce anyway, but
      // this makes both sides unambiguous.
      objectID: Number(tripID),
      authID: user?.id,
      updatedBy: user?.name,
      payload,
      requestPayload,
      customDescription: `${description}: ${reason}`,
      changeJSON,
      user,
    };

    // Every caller runs this AFTER its transaction has committed - create()
    // takes no transaction and writes to a dynamic monthly table
    // (eventlogDynamicModel.ts:18-26), so it cannot join one.
    try {
      await this.eventlogService.create(eventLog);
      return;
    } catch (firstError: any) {
      // Retry ONCE before giving up. The likely failures here are transient - a
      // monthly EventLogs_<mon>_<year> table not yet provisioned, or a brief DB
      // blip - and a single retry closes both. Logged at warn so a retry that
      // succeeds is still visible.
      this.logger.warn(
        `Audit write failed for trip ${tripID} (${description}); retrying once. ${firstError?.message}`,
      );
      try {
        await this.eventlogService.create(eventLog);
        return;
      } catch (retryError) {
        // Hard failure. EventLogService.create rethrows as
        // InternalServerErrorException (eventlog.service.ts:80-91); letting that
        // escape would be strictly worse than swallowing it, because the edit is
        // already durable. The admin would see a failure for a change that
        // succeeded and retry - and on attendance / cab-arrival /
        // estimated-distance the retry silently DOUBLE-APPLIES, while on add it
        // 400s with "already on the trip". Either way the change is committed
        // and unaudited, so the 500 buys nothing and costs correctness.
        //
        // The residual gap is real and accepted, not hidden: CLAUDE.md names
        // EventLog as the only control in this domain, so a hard failure here
        // leaves a durable edit with NO edit-history row and this log line as
        // the sole record. Disclosed in the FE contract note.
        this.logger.error(
          `AUDIT WRITE FAILED (after retry) for trip ${tripID} (${description}). The edit WAS applied. reason="${reason}" user=${
            user?.id
          } changeJSON=${JSON.stringify(changeJSON)}`,
          retryError?.stack,
        );
      }
    }
  }

  /**
   * Adds an employee to a Completed trip from the Trip Billing Report page.
   *
   * Ordering is what makes this safe (no half-write is reachable):
   *
   *   1. resolve + validate            - no writes
   *   2. build the prospective roster  - on a deep copy
   *   3. Google Maps + est-time        - BEFORE the transaction opens, so a Maps
   *                                      failure writes nothing and holds no DB
   *                                      transaction open across an external call
   *   4. transaction opens
   *   5. create-or-reuse the TripRequest
   *   6. Trip.update (employees / estimatedDistance / routeLegs / occupancy)
   *   7. commit, else rollback
   *   8. EventLog, after commit
   *
   * Known, disclosed exposure: calculateEmployeeEstTime in step 3 writes
   * TripRequest.pickUpTime/.dropTime for the OTHER employees on the trip, taking
   * no transaction argument (employee-est-time-calculation.service.ts:60-67,
   * :98-105). Those writes are outside this transaction and cannot be rolled
   * back, so a failure in step 5-6 leaves a freshly-estimated pickup time on a
   * trip whose roster did not change. That is cosmetic - no billing, status or
   * attendance effect - and it is what production already risks on every add and
   * reorder today. Making it atomic would mean threading a transaction through a
   * signature shared by 13 call sites.
   *
   * TripActual is not touched.
   */
  async updateBillingTripEmployeeAdd(
    dto: BillingTripEmployeeAddDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    let transaction: any = null;
    try {
      const { trip, reason } = await this.assertBillingEditableTrip(
        dto.tripID,
        dto.reason,
        user,
      );

      // TripRequests.date is NOT NULL (224-trip-request.js:58-61). Trip.date is
      // DATEONLY (328-create-trip.js:172-175) so Sequelize hands it back as a
      // plain 'YYYY-MM-DD' string - the same form the mobile self-booking path
      // feeds that column in production (mob.trip-request.service.ts:70 -> :103).
      // strictNullChecks is off, so a null date here would surface as a NOT NULL
      // violation 500 rather than a compile error.
      if (!moment(trip.date, 'YYYY-MM-DD', true).isValid()) {
        throw new BadRequestException(
          'This trip has no usable date, so a trip request cannot be created for it.',
        );
      }
      if (!isPresent(trip.shiftTime) || String(trip.shiftTime).trim() === '') {
        throw new BadRequestException(
          'This trip has no shift time, so a trip request cannot be created for it.',
        );
      }

      // Scoped to trip.orgID, NOT user.orgID - the trip is already resolved and
      // its org is authoritative. Scoping to user.orgID and exempting SuperAdmin
      // would let org B's employee be attached to org A's trip.
      const employee = await this.employeeModel.findOne({
        where: { id: dto.employeeID, orgID: trip.orgID },
        include: [
          { model: Location, as: 'location', attributes: ['id', 'name'] },
        ],
      });
      if (!employee) {
        throw new BadRequestException(
          "Employee not found in this trip's organization.",
        );
      }

      const employees = this.cloneTripEmployees(trip);
      // Blocks a re-add of a removedByAdmin entry too: the record is still there
      // and re-adding would produce two entries for one employee.
      if (employees.some((emp) => String(emp?.id) === String(dto.employeeID))) {
        throw new BadRequestException(
          'This employee is already on the trip. Remove the existing entry first if it needs re-adding.',
        );
      }

      // The pickDrop string -> boolean conversion, reused from trip.service.ts:2433.
      const pickDropBool = trip.pickDrop === PickDrop.Pick;

      // ONLY Approved. findAllTripRequestsForEdit - the live add path - filters
      // status = Status.Approved (trip-request.service.ts:1169), so an Approved
      // row is the only kind that can collide. An old Cancelled / Rejected /
      // Requested / Employee-Self-No-Show row is invisible to that path and must
      // NOT block: an employee who rode without a valid booking commonly holds
      // exactly such a stale row for the shift.
      // The date match is a DAY RANGE, not an equality test, and that is
      // load-bearing. TripRequests.date is Sequelize.DATE - a TIMESTAMP
      // (224-trip-request.js:58-61) - while Trip.date is DATEONLY
      // (328-create-trip.js:172-175), so Sequelize hands it over as the string
      // 'YYYY-MM-DD'. Comparing the two for equality matches only rows stored at
      // exactly midnight in the session timezone, and this column's other
      // readers deliberately use an IST day range
      // (trip-request.service.ts:1044-1052, :1075-1077) - direct evidence that
      // not every row is midnight-aligned.
      //
      // A miss here would be SILENT and doubly harmful: the reuse branch below
      // would not fire, creating a duplicate Approved TripRequest for the same
      // employee/date/shift - the exact outcome that branch exists to prevent -
      // and the cross-trip guard right after it would not fire either, letting
      // an employee already assigned to another trip be added anyway.
      //
      // Built with moment-timezone rather than the luxon the cited readers use:
      // luxon is a real dependency (package.json:69) but only one file in the
      // repo imports it, whereas this file already imports moment-timezone
      // (:36-37) and already builds an IST value the same way at :3074-3075.
      // 'Asia/Kolkata' is the bare literal every one of the 13 sites in the repo
      // uses - there is no timezone config source to read instead.
      const startOfDayIST = moment
        .tz(String(trip.date), 'YYYY-MM-DD', 'Asia/Kolkata')
        .startOf('day')
        .toDate();
      const endOfDayIST = moment
        .tz(String(trip.date), 'YYYY-MM-DD', 'Asia/Kolkata')
        .endOf('day')
        .toDate();

      const existingRequest = await this.tripRequestModel.findOne({
        where: {
          employeeID: dto.employeeID,
          orgID: trip.orgID,
          date: { [Op.between]: [startOfDayIST, endOfDayIST] },
          shiftTime: trip.shiftTime,
          pickDrop: pickDropBool,
          status: Status.Approved,
        },
      });

      if (
        existingRequest &&
        isPresent(existingRequest.tripID) &&
        String(existingRequest.tripID) !== String(trip.id)
      ) {
        throw new BadRequestException(
          `This employee is already assigned to trip #${existingRequest.tripID} for this shift. Remove them from that trip first.`,
        );
      }

      // Build the prospective roster. tripRequestID is a placeholder here and is
      // stamped with the real id before Trip.update - see the loop below.
      //
      // Attendance defaults for a NEWLY created request are explicitly
      // unmarked - attendance false AND noShow false. An admin adding an
      // employee post-completion is recording someone who DID ride; defaulting
      // noShow to true would mark a rider absent, and leaving it null (the
      // column default, trip-request.model.ts:134-135) is not "unmarked" to any
      // consumer. A REUSED request keeps its own recorded values instead, since
      // those are a real record of what happened.
      const employeeEntry: any = {
        id: String(employee.id),
        empCode: employee.employeeCode,
        name: employee.name,
        location: (employee as any)?.location?.name,
        address: employee.address,
        landmark: employee.landmark,
        homepoint: employee.homePoint,
        commuteDistance: employee.commuteDistance,
        gender: employee.gender,
        tripRequestID: null,
        noShow: existingRequest ? existingRequest.noShow ?? false : false,
        deboard: existingRequest ? existingRequest.deboard ?? false : false,
        attendance: existingRequest
          ? existingRequest.attendance ?? false
          : false,
        specialConsideration: employee.specialConsideration,
      };

      const prospective = [...employees, employeeEntry];
      const active = prospective.filter((emp) =>
        this.isActiveTripEmployee(emp),
      );

      // Step 3 - external call, before any transaction is opened.
      const recomputed = await this.recomputeTripRoute(trip, active);

      // calculateEmployeeEstTime returns the array it was given (reversed back on
      // the Pick branch), so the added employee carries its computed time here.
      const addedWithTime = (recomputed.employees as any[]).find(
        (emp) => String(emp?.id) === String(employee.id),
      );

      // Removed entries were held out of the recompute; re-append them unchanged
      // so the record survives.
      const removedEntries = prospective.filter(
        (emp) => !this.isActiveTripEmployee(emp),
      );
      const finalEmployees = [
        ...(recomputed.employees as any[]),
        ...removedEntries,
      ];

      transaction = await this.sequelize.transaction();

      let tripRequestID: any;
      if (existingRequest) {
        // Reuse rather than reject. An Approved request with a null tripID is an
        // orphan (the employee rode without the request being attached), and an
        // Approved request already pointing at THIS trip just means employees[]
        // was missing the entry. Creating a second row in either case would
        // duplicate what findAllTripRequestsForEdit reads.
        await this.tripRequestModel.update(
          {
            tripID: trip.id,
            ...(pickDropBool
              ? { pickUpTime: addedWithTime?.cabArrivalTime }
              : { dropTime: addedWithTime?.cabArrivalTime }),
          } as any,
          { where: { id: existingRequest.id }, transaction },
        );
        tripRequestID = existingRequest.id;
      } else {
        // Field sourcing follows the canonical create at
        // trip-request.service.ts:2220-2233. status Approved fires no hook, cron
        // or notification, so it is safe on a finished trip. Only date and
        // shiftTime are NOT NULL (224-trip-request.js) - the rest are populated
        // so the row looks like every other TripRequest rather than the bare
        // minimum.
        const created = await this.tripRequestModel.create(
          {
            orgID: trip.orgID,
            employeeID: employee.id,
            employeeCode: employee.employeeCode,
            date: trip.date,
            shiftTime: trip.shiftTime,
            pickDrop: pickDropBool,
            status: Status.Approved,
            tripID: trip.id,
            locationID: employee.locationID,
            locationName: (employee as any)?.location?.name,
            // Explicitly unmarked, matching the employees[] entry above.
            attendance: false,
            noShow: false,
            deboard: false,
            // No source for these on a Completed trip; explicit rather than
            // silently absent. attendanceOtp is meaningless post-completion.
            locationType: null,
            attendanceOtp: null,
            remarks: `Added post-completion from billing edit: ${reason}`,
            ...(pickDropBool
              ? { pickUpTime: addedWithTime?.cabArrivalTime }
              : { dropTime: addedWithTime?.cabArrivalTime }),
          } as any,
          { transaction },
        );
        tripRequestID = created.id;
      }

      // Stamp the id onto the entry BEFORE Trip.update, so the appended employee
      // is never persisted with a null tripRequestID - that would make their
      // attendance permanently un-editable (updateBillingTripAttendance 400s
      // without it).
      for (const emp of finalEmployees) {
        if (String(emp?.id) === String(employee.id)) {
          emp.tripRequestID = tripRequestID;
        }
      }
      if (!isPresent(tripRequestID)) {
        // Unreachable via either branch above, but a null here would silently
        // ship an un-markable employee. Roll back instead.
        throw new InternalServerErrorException(
          'Failed to resolve a trip request for the added employee.',
        );
      }

      await this.syncManualCabTimesToTripRequests(
        trip,
        finalEmployees,
        transaction,
      );

      const activeCount = finalEmployees.filter((emp) =>
        this.isActiveTripEmployee(emp),
      ).length;
      // String(): estimatedOccupancy is VARCHAR (trip.model.ts:149-150,
      // 328-create-trip.js:132-135). The prior art at :5435-5437 passes a raw
      // number and lets Sequelize coerce; slices 1 and 2 established that money
      // and count values are cast explicitly at the write.
      const newOccupancy = String(trip.spock ? activeCount + 1 : activeCount);

      const [, updatedRows] = await this.tripModel.update(
        {
          employees: finalEmployees,
          estimatedDistance: recomputed.estimatedDistance,
          routeLegs: recomputed.legs,
          // Matches deleteEmployeeFromTrip's formula (trip.service.ts:5435-5437).
          estimatedOccupancy: newOccupancy,
        } as any,
        { where: { id: trip.id }, returning: true, transaction },
      );

      // The handle is nulled BEFORE commit(), not after. If commit() itself
      // throws, the catch below must not call rollback() on an already-finished
      // transaction - Sequelize throws "Transaction cannot be rolled back
      // because it has been finished with state: commit", which escapes the
      // catch and masks the real error.
      const committing = transaction;
      transaction = null;
      await committing.commit();

      const updatedTrip = updatedRows?.[0];

      await this.logBillingEmployeeEdit(
        trip.id,
        updatedTrip,
        dto,
        {
          employeeAdded: {
            OldValue: null,
            newValue: {
              id: String(employee.id),
              empCode: employee.employeeCode,
              name: employee.name,
              tripRequestID: String(tripRequestID),
              tripRequestReused: existingRequest ? true : false,
            },
          },
          estimatedDistance: {
            OldValue: trip.estimatedDistance,
            newValue: recomputed.estimatedDistance,
          },
          estimatedOccupancy: {
            OldValue: trip.estimatedOccupancy,
            newValue: newOccupancy,
          },
        },
        'Employee added to completed trip',
        reason,
        user,
      );

      return {
        message: 'Employee added successfully',
        data: updatedTrip,
      };
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Flags an employee as removed from a Completed trip.
   *
   * The entry is KEPT in employees[] with a removedByAdmin marker rather than
   * spliced out (as deleteEmployeeFromTrip:5372-5374 does on an unlocked trip),
   * so the billing record of who was on the trip survives. estimatedDistance,
   * routeLegs and estimatedOccupancy are deliberately NOT recomputed - the trip
   * physically ran with this employee aboard.
   *
   * NOTE: no backend consumer filters on removedByAdmin. The billing report
   * returns employees[] raw (trip-report.service.ts:104, :225), as do the trip
   * views and the exports, so a removed employee stays VISIBLE until the FE
   * filters them out. Filtering server-side would be a breaking removal of data
   * those pages already read. This is required FE work, recorded in the contract
   * note.
   */
  async updateBillingTripEmployeeRemove(
    dto: BillingTripEmployeeRemoveDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    let transaction: any = null;
    try {
      const { trip, reason } = await this.assertBillingEditableTrip(
        dto.tripID,
        dto.reason,
        user,
      );

      const employees = this.cloneTripEmployees(trip);
      const target = employees.find(
        (emp) => String(emp?.id) === String(dto.employeeID),
      );
      if (!target) {
        throw new BadRequestException('This employee is not on the trip.');
      }
      if (!this.isActiveTripEmployee(target)) {
        throw new BadRequestException(
          'This employee has already been removed from the trip.',
        );
      }

      const removedAt = moment().format('YYYY-MM-DD HH:mm:ss');
      target.removedByAdmin = true;
      target.removedAt = removedAt;
      target.removedReason = reason;

      transaction = await this.sequelize.transaction();

      await this.tripModel.update({ employees } as any, {
        where: { id: trip.id },
        transaction,
      });

      // Matches the unlocked-remove behaviour (trip.service.ts:5445-5447) minus
      // the recompute: the request no longer points at this trip. Done inline
      // rather than through tripRequestService.updateTripID so it joins this
      // transaction - that helper takes no transaction argument.
      if (isPresent(target.tripRequestID)) {
        await this.tripRequestModel.update({ tripID: null } as any, {
          // Scoped by employeeID and orgID for the same reason as the attendance
          // write: a stale id in the employees[] JSON must not detach another
          // employee's - or another org's - trip request. Not asserted on zero
          // rows here: unlike attendance, a no-op detach leaves nothing
          // inconsistent, and the employees[] flag is the authoritative record.
          where: {
            id: target.tripRequestID,
            employeeID: target.id,
            orgID: trip.orgID,
          },
          transaction,
        });
      }

      // The handle is nulled BEFORE commit(), not after. If commit() itself
      // throws, the catch below must not call rollback() on an already-finished
      // transaction - Sequelize throws "Transaction cannot be rolled back
      // because it has been finished with state: commit", which escapes the
      // catch and masks the real error.
      const committing = transaction;
      transaction = null;
      await committing.commit();

      const updatedTrip = await this.tripModel.findOne({
        where: { id: trip.id },
      });

      await this.logBillingEmployeeEdit(
        trip.id,
        updatedTrip,
        dto,
        {
          employeeRemoved: {
            OldValue: null,
            newValue: {
              id: String(target.id),
              empCode: target.empCode,
              name: target.name,
              tripRequestID: isPresent(target.tripRequestID)
                ? String(target.tripRequestID)
                : null,
              removedAt,
            },
          },
          // Stated explicitly so the audit trail records that the geometry was
          // intentionally left alone.
          estimatedDistance: {
            OldValue: trip.estimatedDistance,
            newValue: 'unchanged (not recomputed on removal)',
          },
        },
        'Employee removed from completed trip',
        reason,
        user,
      );

      return {
        message: 'Employee removed successfully',
        data: updatedTrip,
      };
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Reorders the active roster of a Completed trip and recomputes the route.
   *
   * This is the billing-edit equivalent of updateEmployeeOrderTrip
   * (trip.service.ts:2914), which is NOT modified. Two differences make this the
   * safe version: it takes only an ordered list of ids and reorders the SERVER's
   * stored array (the original trusts a whole client-supplied trip object,
   * including the pre-reordered employees[]), and it scopes to trip.orgID rather
   * than user.orgID.
   */
  async updateBillingTripEmployeeOrder(
    dto: BillingTripEmployeeOrderDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    let transaction: any = null;
    try {
      const { trip, reason } = await this.assertBillingEditableTrip(
        dto.tripID,
        dto.reason,
        user,
      );

      const employees = this.cloneTripEmployees(trip);
      const active = employees.filter((emp) => this.isActiveTripEmployee(emp));
      const removedEntries = employees.filter(
        (emp) => !this.isActiveTripEmployee(emp),
      );

      // Exact permutation of the ACTIVE roster - no missing, extra or duplicate
      // ids. A stale client array can otherwise silently drop an employee.
      const requested = dto.employeeIDs.map((id) => String(id));
      const requestedSet = new Set(requested);
      if (requestedSet.size !== requested.length) {
        throw new BadRequestException('employeeIDs contains duplicate ids.');
      }
      const activeIDs = active.map((emp) => String(emp?.id));
      if (
        requested.length !== activeIDs.length ||
        !activeIDs.every((id) => requestedSet.has(id))
      ) {
        throw new BadRequestException(
          'employeeIDs must list every employee currently on the trip, exactly once.',
        );
      }

      const byID = new Map(active.map((emp) => [String(emp?.id), emp]));
      const reordered = requested.map((id) => byID.get(id));

      // Before the transaction - external Maps call. Same reasoning as the add
      // path, including the disclosed pickUpTime/dropTime exposure.
      const recomputed = await this.recomputeTripRoute(trip, reordered);

      const finalEmployees = [
        ...(recomputed.employees as any[]),
        ...removedEntries,
      ];

      transaction = await this.sequelize.transaction();

      await this.syncManualCabTimesToTripRequests(
        trip,
        finalEmployees,
        transaction,
      );

      const [, updatedRows] = await this.tripModel.update(
        {
          employees: finalEmployees,
          estimatedDistance: recomputed.estimatedDistance,
          routeLegs: recomputed.legs,
        } as any,
        { where: { id: trip.id }, returning: true, transaction },
      );

      // The handle is nulled BEFORE commit(), not after. If commit() itself
      // throws, the catch below must not call rollback() on an already-finished
      // transaction - Sequelize throws "Transaction cannot be rolled back
      // because it has been finished with state: commit", which escapes the
      // catch and masks the real error.
      const committing = transaction;
      transaction = null;
      await committing.commit();

      const updatedTrip = updatedRows?.[0];

      await this.logBillingEmployeeEdit(
        trip.id,
        updatedTrip,
        dto,
        {
          employeeOrder: {
            OldValue: activeIDs,
            newValue: requested,
          },
          estimatedDistance: {
            OldValue: trip.estimatedDistance,
            newValue: recomputed.estimatedDistance,
          },
        },
        'Employee order changed on completed trip',
        reason,
        user,
      );

      return {
        message: 'Employee order updated successfully',
        data: updatedTrip,
      };
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Sets attendance / no-show for one employee on a Completed trip.
   *
   * Attendance lives in TWO unsynced places - TripRequest.attendance/
   * attendanceTime and Trip.employees[].attendance/attendanceTime - with no
   * shared sync helper; every existing path duplicates the write by hand. This
   * one does too, but inside a transaction so the two cannot diverge.
   *
   * TIME FORMAT: 'YYYY-MM-DD HH:mm:ss' for BOTH tables, copying markAttendance
   * (trip-request.service.ts:636 and :670), which is the nearest prior art - an
   * admin manually marking attendance. The driver OTP path
   * (driver.trip.services.ts:575) is the only writer that puts a bare 'HH:mm:ss'
   * into TripRequest.attendanceTime, and it is the outlier: the employee-delay
   * report parses that column with an explicit 'YYYY-MM-DD HH:mm:ss'
   * (trip-req-report-export.service.ts:1125-1128), so an 'HH:mm:ss' row yields an
   * Invalid Date and a NaN delay.
   *
   * No "attendance already marked" block. The one at
   * trip-request.service.ts:622-626 exists to stop double-marking during a live
   * trip; correcting a wrong value is this route's entire purpose.
   */
  async updateBillingTripAttendance(
    dto: BillingTripAttendanceDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    let transaction: any = null;
    try {
      const { trip, reason } = await this.assertBillingEditableTrip(
        dto.tripID,
        dto.reason,
        user,
      );

      const employees = this.cloneTripEmployees(trip);
      const target = employees.find(
        (emp) => String(emp?.id) === String(dto.employeeID),
      );
      if (!target) {
        throw new BadRequestException('This employee is not on the trip.');
      }
      if (!this.isActiveTripEmployee(target)) {
        throw new BadRequestException(
          'This employee has been removed from the trip; attendance cannot be edited.',
        );
      }
      // Without a tripRequestID only one of the two tables could be written, and
      // a half-write is exactly the drift this route exists to avoid. 400 rather
      // than silently updating employees[] alone.
      if (!isPresent(target.tripRequestID)) {
        throw new BadRequestException(
          'This employee has no linked trip request, so attendance cannot be edited.',
        );
      }

      const attendanceTime = await this.resolveAttendanceTimestamp(
        trip,
        dto.attendanceTime,
      );

      const present = dto.present === true;
      const before = {
        attendance: target.attendance,
        noShow: target.noShow,
        attendanceTime: target.attendanceTime,
        attendanceMode: target.attendanceMode,
      };

      // Both columns exist and are nullable on TripRequest (attendanceMode:
      // model :119-120, 224-trip-request.js:101-104; attendance/attendanceTime:
      // model :125-132, migration :109-120), and both keys are written into
      // employees[] by markAttendance (trip-request.service.ts:668-673).
      const attendanceWrite: any = {
        attendance: present,
        noShow: !present,
        attendanceTime,
        attendanceMode: present ? 'Manual' : null,
      };
      if (isPresent(dto.attendanceLocation)) {
        attendanceWrite.attendanceLocation = dto.attendanceLocation;
      }

      Object.assign(target, attendanceWrite);

      transaction = await this.sequelize.transaction();

      // Scoped by employeeID and orgID as well as the primary key: the id comes
      // out of Trip.employees[] JSON, which other paths overwrite wholesale
      // without validation (removeEmployeeFromTrips, trip.service.ts:4741-4773),
      // so a stale value would otherwise write attendance onto an arbitrary
      // TripRequest row - possibly another organisation's. Matches the scoping
      // the prior art applies (trip-request.service.ts:641-644).
      const [affectedCount] = await this.tripRequestModel.update(
        attendanceWrite,
        {
          where: {
            id: target.tripRequestID,
            employeeID: dto.employeeID,
            orgID: trip.orgID,
          },
          transaction,
        },
      );
      // Zero rows means the linked request does not belong to this employee or
      // this org - the employees[] entry is stale. Throwing rolls back the
      // Trip write too, rather than leaving employees[] updated and TripRequest
      // untouched, which is exactly the two-table drift this route exists to
      // prevent.
      if (affectedCount === 0) {
        throw new BadRequestException(
          'The linked trip request for this employee could not be found. Attendance was not changed.',
        );
      }

      const [, updatedRows] = await this.tripModel.update(
        { employees } as any,
        { where: { id: trip.id }, returning: true, transaction },
      );

      // The handle is nulled BEFORE commit(), not after. If commit() itself
      // throws, the catch below must not call rollback() on an already-finished
      // transaction - Sequelize throws "Transaction cannot be rolled back
      // because it has been finished with state: commit", which escapes the
      // catch and masks the real error.
      const committing = transaction;
      transaction = null;
      await committing.commit();

      const updatedTrip = updatedRows?.[0];

      await this.logBillingEmployeeEdit(
        trip.id,
        updatedTrip,
        dto,
        {
          employeeID: { OldValue: null, newValue: String(dto.employeeID) },
          tripRequestID: {
            OldValue: null,
            newValue: String(target.tripRequestID),
          },
          attendance: {
            OldValue: before.attendance,
            newValue: attendanceWrite.attendance,
          },
          noShow: { OldValue: before.noShow, newValue: attendanceWrite.noShow },
          attendanceTime: {
            OldValue: before.attendanceTime,
            newValue: attendanceTime,
          },
          attendanceMode: {
            OldValue: before.attendanceMode,
            newValue: attendanceWrite.attendanceMode,
          },
          attendanceTimeSource: {
            OldValue: null,
            newValue: isPresent(dto.attendanceTime)
              ? 'client-supplied'
              : 'defaulted to 5 minutes before trip end',
          },
        },
        present
          ? 'Attendance marked present on completed trip'
          : 'Attendance marked no-show on completed trip',
        reason,
        user,
      );

      return {
        message: 'Attendance updated successfully',
        data: updatedTrip,
      };
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * The attendance timestamp: the client's override, else 5 minutes before the
   * trip's end.
   *
   * Trip end is TripActual.actualEndDate + .actualEndTime. Those two are NOT
   * both strings despite the model typing them so: actualEndDate is a Postgres
   * TIMESTAMPTZ (331-create-trip-actuals.js:39-42) that Sequelize hands back as a
   * JS Date, while actualEndTime is a genuine VARCHAR 'HH:mm:ss'. So the date
   * side is normalised through moment() rather than string-concatenated -
   * templating a Date directly would yield
   * "Tue Jul 21 2026 00:00:00 GMT+0530 (...)" and parse to garbage.
   *
   * There is deliberately NO moment() fallback: defaulting to "now" would stamp
   * today's date onto a trip that ran months ago. An unusable end time is a 400
   * telling the admin to supply the timestamp explicitly.
   */
  private async resolveAttendanceTimestamp(
    trip: Trip,
    override: string,
  ): Promise<string> {
    if (isPresent(override)) {
      return override;
    }

    // String(): findTripActualDataWithTripID takes `tripID: string`
    // (trip-actuals.service.ts:458), matching how slice 1 (:4314) and slice 2
    // (:4766) call it.
    const tripActual =
      await this.tripActualService.findTripActualDataWithTripID(
        String(trip.id),
      );
    if (
      !tripActual ||
      !isPresent(tripActual.actualEndDate) ||
      !isPresent(tripActual.actualEndTime)
    ) {
      throw new BadRequestException(
        'This trip has no recorded end time, so the attendance time cannot be defaulted. Supply attendanceTime explicitly.',
      );
    }

    // Neither branch is an implicit string parse.
    //
    // actualEndDate is a Postgres TIMESTAMPTZ (331-create-trip-actuals.js:39-42)
    // that Sequelize hands back as a JS Date even though the model types it
    // `string`, so the Date branch is the normal one and moment(Date) does no
    // string parsing at all. The string branch exists only for a legacy row that
    // comes back as text: it slices the leading 'YYYY-MM-DD' exactly as slice
    // 1's normaliseDate does (trip-actuals.service.ts:45-46) rather than letting
    // moment guess at the format.
    //
    // The two branches are NOT timezone-equivalent, and that is worth stating
    // rather than glossing: moment(Date).format() resolves in the node process
    // timezone, while .slice(0,10) takes whatever calendar day the string
    // literally carries (UTC for an ISO string). If the DB session TZ and the
    // node TZ straddle midnight the two would disagree by a day. Local time is
    // the deliberate choice - it matches how every other attendance writer
    // stamps this value (moment().format(...), e.g.
    // trip-request.service.ts:629) and how the delay report re-parses it - so
    // the Date branch, the one that actually runs, is the correct one.
    const rawEndDate: any = tripActual.actualEndDate;
    const datePart =
      rawEndDate instanceof Date
        ? moment(rawEndDate).format('YYYY-MM-DD')
        : String(rawEndDate).slice(0, 10);

    // Explicit formats + strict: a VARCHAR pair must never be parsed by
    // guesswork. Anything matching neither shape fails isValid() below and
    // becomes a 400 rather than a silently wrong timestamp.
    //
    // BOTH 'HH:mm:ss' and 'HH:mm' are accepted because slice 1 explicitly
    // permits the seconds-less form: trip-actuals.dto.ts:23 is
    // /^\d{2}:\d{2}(:\d{2})?$/ with the message "actualEndTime must be HH:mm or
    // HH:mm:ss", and trip-actuals.service.ts:441 writes the DTO value through to
    // the STRING column unnormalised. Accepting only 'HH:mm:ss' would 400 this
    // attendance edit with "no usable end time" on every trip whose end time was
    // saved as "21:45" from the billing page - a trip that has a perfectly good
    // end time.
    const endMoment = moment(
      `${datePart} ${tripActual.actualEndTime}`,
      ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm'],
      true,
    );
    if (!endMoment.isValid()) {
      throw new BadRequestException(
        'This trip has no usable end time, so the attendance time cannot be defaulted. Supply attendanceTime explicitly.',
      );
    }

    return endMoment.subtract(5, 'minutes').format('YYYY-MM-DD HH:mm:ss');
  }

  /**
   * Edits an employee's cab arrival time on a Completed trip.
   *
   * Writes Trip.employees[].cabArrivalTime (the 'HH:mm' string the JSON sample
   * shows) plus a cabArrivalTimeManual marker, and re-syncs the corresponding
   * TripRequest.pickUpTime / .dropTime so the two agree immediately - a
   * two-table write, hence the transaction.
   *
   * The marker is what makes the value survive a later add or reorder;
   * recomputeTripRoute honours it.
   *
   * NOT touched: TripRequest.cabArrivedAt (Date) and .markCabReached (boolean).
   * Those are a different concept - cabArrivalTime is the ESTIMATED arrival
   * written by employee-est-time-calculation.service.ts, cabArrivedAt is the
   * ACTUAL driver-marked one. Consequence: the driver-delay column reads
   * cabArrivedAt (trip-req-report-export.service.ts:1120-1123) and will NOT
   * reflect edits made here. Flagged as a follow-up.
   */
  async updateBillingTripCabArrival(
    dto: BillingTripCabArrivalDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    let transaction: any = null;
    try {
      const { trip, reason } = await this.assertBillingEditableTrip(
        dto.tripID,
        dto.reason,
        user,
      );

      const employees = this.cloneTripEmployees(trip);
      const target = employees.find(
        (emp) => String(emp?.id) === String(dto.employeeID),
      );
      if (!target) {
        throw new BadRequestException('This employee is not on the trip.');
      }
      if (!this.isActiveTripEmployee(target)) {
        throw new BadRequestException(
          'This employee has been removed from the trip; cab arrival time cannot be edited.',
        );
      }

      const previous = target.cabArrivalTime;
      target.cabArrivalTime = dto.cabArrivalTime;
      target.cabArrivalTimeManual = true;

      transaction = await this.sequelize.transaction();

      const [, updatedRows] = await this.tripModel.update(
        { employees } as any,
        { where: { id: trip.id }, returning: true, transaction },
      );

      // Keeps employees[].cabArrivalTime and TripRequest.pickUpTime/.dropTime in
      // agreement from the moment the edit lands.
      await this.syncManualCabTimesToTripRequests(trip, [target], transaction);

      // The handle is nulled BEFORE commit(), not after. If commit() itself
      // throws, the catch below must not call rollback() on an already-finished
      // transaction - Sequelize throws "Transaction cannot be rolled back
      // because it has been finished with state: commit", which escapes the
      // catch and masks the real error.
      const committing = transaction;
      transaction = null;
      await committing.commit();

      const updatedTrip = updatedRows?.[0];

      await this.logBillingEmployeeEdit(
        trip.id,
        updatedTrip,
        dto,
        {
          employeeID: { OldValue: null, newValue: String(dto.employeeID) },
          cabArrivalTime: {
            OldValue: previous,
            newValue: dto.cabArrivalTime,
          },
          cabArrivalTimeManual: { OldValue: null, newValue: true },
          cabArrivedAt: {
            OldValue: 'unchanged',
            newValue:
              'unchanged (TripRequest.cabArrivedAt is not written by this edit)',
          },
        },
        'Cab arrival time edited on completed trip',
        reason,
        user,
      );

      return {
        message: 'Cab arrival time updated successfully',
        data: updatedTrip,
      };
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Per-employee ACTUAL cab-arrival timestamps for a trip, for the billing-edit
   * modal. TripRequests.cabArrivedAt has no admin edit path and is absent from
   * GET billing/trip-report/:id's response - this fills that gap without
   * touching that endpoint or its shape.
   *
   * Deliberately does NOT filter on markCabReached (contrast
   * getCabArrivalTimeReport, trip-request-report.service.ts): a NULL
   * cabArrivedAt must still come back as a row here, so the modal can render
   * "-" and offer an edit, rather than the employee silently vanishing.
   */
  async listBillingEditEmployeeCabArrivals(
    tripID: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const trip = await this.findTripForBillingEdit(tripID, user);

      const requests = await this.tripRequestModel.findAll({
        where: { tripID: trip.id },
        attributes: ['employeeID', 'cabArrivedAt'],
      });

      const items = requests.map((req: any) => ({
        employeeID: String(req.employeeID),
        cabArrivedAt: req.cabArrivedAt,
      }));

      return { items, totalItems: items.length };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Corrects an employee's ACTUAL cab-arrival time (TripRequest.cabArrivedAt)
   * on a Completed trip. Single-table write - see the comment above the update
   * call for why no transaction is used.
   *
   * NOT touched: Trip.employees[].cabArrivalTime (the ESTIMATED field, edited
   * separately by updateBillingTripCabArrival above), markCabReached,
   * cabWaitingTime, pickUpTime, dropTime. cabArrivedAt has no JSONB twin
   * anywhere - this is the only place it lives, so there is nothing else to
   * sync.
   *
   * This is also the first AUDITED writer of this column: markCabReached (the
   * only other writer, driver.trip.services.ts) calls no EventLogService at
   * all.
   */
  async updateBillingTripCabArrived(
    dto: BillingTripCabArrivedDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    try {
      const { trip, reason } = await this.assertBillingEditableTrip(
        dto.tripID,
        dto.reason,
        user,
      );

      // Roster check mirrors updateBillingTripCabArrival's (isActiveTripEmployee),
      // reading Trip.employees[] only to validate - this method never writes it.
      const employees = this.cloneTripEmployees(trip);
      const target = employees.find(
        (emp) => String(emp?.id) === String(dto.employeeID),
      );
      if (!target) {
        throw new BadRequestException('This employee is not on the trip.');
      }
      if (!this.isActiveTripEmployee(target)) {
        throw new BadRequestException(
          'This employee has been removed from the trip; cab arrival time cannot be edited.',
        );
      }

      // Scoped by target.tripRequestID when the roster entry carries one -
      // matching the precedent every other writer in this file follows
      // (syncManualCabTimesToTripRequests, the attendance write) rather than
      // trusting (tripID, employeeID) alone, which could resolve the wrong row
      // if more than one TripRequest for this employee ever pointed at this
      // trip. Falls back to the pair only for older rosters that predate the
      // tripRequestID stamp.
      const tripRequest = isPresent(target?.tripRequestID)
        ? await this.tripRequestModel.findOne({
            where: { id: target.tripRequestID, employeeID: dto.employeeID },
          })
        : await this.tripRequestModel.findOne({
            where: { tripID: trip.id, employeeID: dto.employeeID },
          });
      if (!tripRequest) {
        throw new BadRequestException(
          'No trip request found for this employee on this trip.',
        );
      }

      // Window check: actualStart and actualEnd are enforced as two
      // INDEPENDENT bounds, not "both present or nothing enforced" - a trip
      // commonly has actualEnd (auto-set on completion) with no actualStart
      // recorded, and an all-or-nothing check would silently disable itself
      // for that common case. Each bound is skipped only if IT is
      // missing/unparsable. Mirrors resolveAttendanceTimestamp's exact
      // Date-vs-string / dual-format parsing rather than inventing a second
      // convention in this file.
      const tripActual =
        await this.tripActualService.findTripActualDataWithTripID(
          String(trip.id),
        );
      const parseActualMoment = (rawDate: any, rawTime: any) => {
        if (!isPresent(rawDate) || !isPresent(rawTime)) {
          return null;
        }
        const datePart =
          rawDate instanceof Date
            ? moment(rawDate).format('YYYY-MM-DD')
            : String(rawDate).slice(0, 10);
        const parsed = moment(
          `${datePart} ${rawTime}`,
          ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm'],
          true,
        );
        return parsed.isValid() ? parsed : null;
      };
      const startMoment = tripActual
        ? parseActualMoment(
            tripActual.actualStartDate,
            tripActual.actualStartTime,
          )
        : null;
      const endMoment = tripActual
        ? parseActualMoment(tripActual.actualEndDate, tripActual.actualEndTime)
        : null;
      // The DTO regex only checks digit SHAPE, not calendar validity - a
      // value like "2026-02-30 10:00:00" matches it but fails moment's strict
      // parse. Rejected explicitly here rather than left to fall through:
      // without this, an invalid candidate would silently skip both window
      // checks below and reach tripRequest.update(), where Postgres would
      // reject the cast with an error that has no .status and surfaces as an
      // unexplained 500 instead of a clean 400.
      const candidate = moment(dto.cabArrivedAt, 'YYYY-MM-DD HH:mm:ss', true);
      if (!candidate.isValid()) {
        throw new BadRequestException(
          'cabArrivedAt is not a valid calendar date/time.',
        );
      }
      if (startMoment && candidate.isBefore(startMoment)) {
        throw new BadRequestException(
          `cabArrivedAt cannot be before the trip's actual start (${startMoment.format(
            'YYYY-MM-DD HH:mm:ss',
          )}).`,
        );
      }
      if (endMoment && candidate.isAfter(endMoment)) {
        throw new BadRequestException(
          `cabArrivedAt cannot be after the trip's actual end (${endMoment.format(
            'YYYY-MM-DD HH:mm:ss',
          )}).`,
        );
      }

      // Formatted, not the raw Date: an unformatted OldValue would
      // JSON-serialize as an ISO string ("2026-03-10T16:28:00.000Z") next to a
      // plain-format newValue ("2026-03-10 21:58:00") - reads as a timezone
      // shift to anyone auditing the log, when nothing actually shifted.
      const previousCabArrivedAt = tripRequest.cabArrivedAt
        ? moment(tripRequest.cabArrivedAt).format('YYYY-MM-DD HH:mm:ss')
        : null;

      // Single UPDATE to a single row is atomic on its own - no
      // sequelize.transaction() needed, unlike updateBillingTripCabArrival
      // above which must keep a Trip.employees[] write and a TripRequest write
      // in agreement across two tables.
      await tripRequest.update({ cabArrivedAt: dto.cabArrivedAt });

      await this.logBillingEmployeeEdit(
        trip.id,
        tripRequest,
        dto,
        {
          employeeID: { OldValue: null, newValue: String(dto.employeeID) },
          cabArrivedAt: {
            OldValue: previousCabArrivedAt,
            newValue: dto.cabArrivedAt,
          },
        },
        'Actual cab arrival time edited on completed trip',
        reason,
        user,
      );

      // data: trip (already in scope, untouched by this write - nothing on
      // Trip changes here), not tripRequest. Matches every sibling
      // billing-edit-employees write's GenericResponse<Trip> shape, which the
      // FE's batch-edit flow reads uniformly across steps. The EventLog
      // payload above still records tripRequest, the row that actually
      // changed, so the audit trail stays accurate regardless.
      return {
        message: 'Cab arrived time updated successfully',
        data: trip,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Direct edit of Trip.estimatedDistance on a Completed trip.
   *
   * No price impact and none intended: calculateTripActuals derives cost from
   * TripActual.actualDistance (trip-actuals.service.ts:153), never from
   * Trip.estimatedDistance. Single-table write, so no transaction.
   */
  async updateBillingTripEstimatedDistance(
    dto: BillingTripEstimatedDistanceDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    try {
      const { trip, reason } = await this.assertBillingEditableTrip(
        dto.tripID,
        dto.reason,
        user,
      );

      const previous = trip.estimatedDistance;

      const [, updatedRows] = await this.tripModel.update(
        { estimatedDistance: dto.estimatedDistance } as any,
        { where: { id: trip.id }, returning: true },
      );

      const updatedTrip = updatedRows?.[0];

      await this.logBillingEmployeeEdit(
        trip.id,
        updatedTrip,
        dto,
        {
          estimatedDistance: {
            OldValue: previous,
            newValue: dto.estimatedDistance,
          },
          // routeLegs is left alone on purpose: the admin is correcting the
          // recorded distance, not the geometry, and recomputing legs would
          // overwrite the stored route with a fresh Maps result.
          routeLegs: {
            OldValue: 'unchanged',
            newValue: 'unchanged (geometry not recomputed)',
          },
        },
        'Estimated distance edited on completed trip',
        reason,
        user,
      );

      return {
        message: 'Estimated distance updated successfully',
        data: updatedTrip,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Corrects the seat count on an already-Completed trip, from the Trip
   * Billing Report detail page, and recalculates the bill at the new seat
   * count's rate.
   *
   * Trip.seats is otherwise write-once, set only at tripsheet import
   * (validateAndFormatData: trip.service.ts:3322, bulkCreate: :3366) - this
   * is the first path that ever changes it post-import.
   *
   * Reuses the slice-2 recalculation machinery verbatim rather than
   * reimplementing it: preflightBillingRecalculation and calculateTripActuals
   * are handed the SAME vendor, just a different seats value, so they hit the
   * identical getVehicleBillingRate(vendorID, orgID, seats) lookup a vendor
   * reassignment already does - including its 400 when the vendor has no rate
   * row for the new seat count, and its multi-slab-has-no-covering-slab check.
   *
   * The occupancy guard compares against the count of ACTIVE trip.employees[]
   * entries, not Trip.estimatedOccupancy: that column bakes in +1 for an
   * escort (see the spock ternary at :6950-6952) while BillingRate.seats is a
   * passenger-only figure, and it is never recomputed when an employee is
   * removed via updateBillingTripEmployeeRemove (:5919-5923 - "the trip
   * physically ran with this employee aboard") - so it can both over- and
   * under-count the live roster. isActiveTripEmployee over employees[] is the
   * only figure that stays correct through both.
   *
   * No transaction, for the same reason as updateBillingTripAssignment:
   * TripActualsService.update() takes no transaction arg and is shared with
   * completeTrip/startTrip. Order is: validate -> occupancy guard -> pre-flight
   * (read-only) -> Trip write -> EventLog -> recalc - EventLog before recalc,
   * same as slice 2, so the audit entry survives even if the recalc throws
   * after Trip.seats is already committed.
   */
  async updateBillingTripSeats(
    dto: BillingTripSeatsDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    try {
      const { trip, reason } = await this.assertBillingEditableTrip(
        dto.tripID,
        dto.reason,
        user,
      );

      const employees = this.cloneTripEmployees(trip);
      const activePassengerCount = employees.filter((emp) =>
        this.isActiveTripEmployee(emp),
      ).length;
      if (Number(dto.seats) < activePassengerCount) {
        throw new BadRequestException(
          `Seat count cannot be set below the number of employees currently on this trip (${activePassengerCount}).`,
        );
      }

      const tripActual =
        await this.tripActualService.findTripActualDataWithTripID(
          String(dto.tripID),
        );

      // Captured BEFORE the recalc overwrites them in place - the only record
      // of what the trip was billed at under the old seat count.
      const previousActualCost = tripActual?.actualCost ?? null;
      const previousBillingRate = tripActual?.billingRate ?? null;

      // An overridden cost is pinned, so no rate is needed and no recalc
      // runs - which means a seat count with no rate row must still be
      // assignable. Skipping the pre-flight here is what makes that work.
      const shouldRecalculate =
        !!tripActual && tripActual.isCostOverridden !== true;

      if (shouldRecalculate) {
        // preflightBillingRecalculation reads seats off the trip object it is
        // HANDED, not as its own parameter - it was built for a vendor
        // change, so the candidate seat count is substituted onto a plain
        // snapshot before the dry run. Same trip.get({ plain: true }) idiom
        // updateBillingTripAssignment already uses for its own before/after
        // diff.
        const preflightTrip = {
          ...trip.get({ plain: true }),
          seats: dto.seats,
        } as unknown as Trip;
        // Read-only, and before any write: on failure nothing has been saved.
        await this.preflightBillingRecalculation(
          trip.vendorID,
          preflightTrip,
          tripActual,
          Boolean(trip.spock),
        );
      }

      const before = trip.get({ plain: true });

      const [, updatedRows] = await this.tripModel.update(
        { seats: dto.seats } as any,
        { where: { id: trip.id }, returning: true },
      );
      const updatedTrip = updatedRows?.[0];
      if (!updatedTrip) {
        throw new NotFoundException('Trip not found');
      }

      const changeJSON: Record<string, any> = {
        seats: { OldValue: before.seats, newValue: dto.seats },
      };
      if (shouldRecalculate) {
        changeJSON.billingRecalc = {
          OldValue: 'unchanged',
          newValue: 'pending recalculation from the new seat count rate',
        };
        // The recalc below overwrites TripActual.actualCost and .billingRate
        // IN PLACE, so this row is the only place the old basis survives.
        changeJSON.actualCost = {
          OldValue: previousActualCost,
          newValue: 'see the Trip Actuals entry for the recalculated figure',
        };
        changeJSON.billingRate = {
          OldValue: previousBillingRate,
          newValue: 'recalculated',
        };
      } else if (tripActual?.isCostOverridden === true) {
        changeJSON.billingRecalc = {
          OldValue: 'unchanged',
          newValue: 'skipped (cost overridden)',
        };
      } else if (!tripActual) {
        changeJSON.billingRecalc = {
          OldValue: 'unchanged',
          newValue: 'skipped (no trip actual row)',
        };
      }
      changeJSON.reason = { OldValue: null, newValue: reason };

      // AUDIT BEFORE RECALC - deliberate ordering, not an oversight, same as
      // updateBillingTripAssignment. There is no transaction, so
      // tripModel.update above is already committed. If the recalc below
      // throws (a concurrent delete of the BillingRate row or the TripActual
      // row between the pre-flight and here), an EventLog write placed AFTER
      // it would never run - leaving a Completed trip with its seat count
      // permanently changed and NO audit record at all.
      await this.eventlogService.create({
        objectType: 'Trip',
        changeType: 'edit',
        objectID: Number(dto.tripID),
        authID: user?.id,
        updatedBy: user?.name,
        payload: updatedTrip,
        requestPayload: dto,
        customDescription: `Seat count edited: ${reason}`,
        changeJSON,
        user,
      });

      if (shouldRecalculate) {
        // totalKM passed as null, same as updateBillingTripAssignment
        // (:4908-4914): calculateTripActuals falls back to
        // TripActual.actualDistance already on the row when no distance is
        // supplied (trip-actuals.service.ts:153), so the billing DISTANCE is
        // left untouched - only the rate lookup, now keyed on the new seats,
        // changes.
        await this.tripActualService.calculateTripActuals(
          updatedTrip,
          null,
          Number(dto.tripID),
          user,
          undefined,
        );
      }

      return {
        message: 'Seat count updated',
        data: updatedTrip,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Seat counts the trip's vendor has a BillingRate configured for, in the
   * trip's org - the source list for the billing-edit seats dropdown, so an
   * admin can only submit a seat count updateBillingTripSeats is guaranteed
   * to find a rate for.
   *
   * Scoped to trip.orgID/trip.vendorID (not user.orgID) for the same reason
   * every other billing-edit lookup is: the trip is already resolved and its
   * org is authoritative, and a SuperAdmin carries no orgID at all.
   */
  async listBillingEditSeatOptions(
    tripID: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const trip = await this.findTripForBillingEdit(tripID, user);
      if (!isPresent(trip.vendorID)) {
        return { items: [], totalItems: 0 };
      }
      const seatOptions =
        await this.billingConfigurationService.getDistinctSeatOptions(
          trip.vendorID,
          trip.orgID,
        );
      const items = seatOptions.map((seats) => ({ seats }));
      return { items, totalItems: items.length };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Employees eligible to be added to a Completed trip, for the FE dropdown.
   *
   * A new route is needed because no existing employee list is filtered to "in
   * this trip's org and not already on this trip". Scoped to trip.orgID (not
   * user.orgID) for the same reason every other billing-edit lookup is: the trip
   * is already resolved and its org is authoritative, and a SuperAdmin carries no
   * orgID at all.
   *
   * Excludes removedByAdmin entries too - re-adding one is blocked by the add
   * path, so offering it in the dropdown would be a dead end.
   */
  async listBillingEditAddableEmployees(
    tripID: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const trip = await this.findTripForBillingEdit(tripID, user);

      const onTrip = new Set(
        this.cloneTripEmployees(trip).map((emp) => String(emp?.id)),
      );

      const employees = await this.employeeModel.findAll({
        where: { orgID: trip.orgID, status: Status.Active },
        attributes: [
          'id',
          'employeeCode',
          'name',
          'gender',
          'homePoint',
          'address',
        ],
        include: [
          { model: Location, as: 'location', attributes: ['id', 'name'] },
        ],
        order: [['name', SortOrder.ASC]],
      });

      // Deduped by id, same shape as the slice-2 dropdowns.
      const seen = new Set<string>();
      const items = [];
      for (const employee of employees as any[]) {
        const id = employee?.id;
        if (!isPresent(id) || seen.has(String(id)) || onTrip.has(String(id))) {
          continue;
        }
        seen.add(String(id));
        items.push({
          id,
          employeeCode: employee?.employeeCode,
          name: employee?.name,
          gender: employee?.gender,
          homePoint: employee?.homePoint,
          address: employee?.address,
          location: employee?.location?.name,
        });
      }
      return { items, totalItems: items.length };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async autoCompleteTrip(
    tripInput: CompleteTripDto,
    user: any,
  ): Promise<GenericResponse<Trip>> {
    try {
      const tripID = parseInt(tripInput.tripID);
      const tripData = await this.findOne(tripID);
      if (!tripData) {
        throw new BadRequestException('Trip ID is required');
      }
      if (tripData.status !== TripStatus.Ongoing) {
        throw new BadRequestException(
          'There are no Ongoing trips for this id.',
        );
      }
      if (tripData.pickDrop !== 'Pick') {
        // this.logger.log(`Auto trip end is applicable only for Pick trips.`);
        // return;
        return {
          message: 'Auto trip end is applicable only for Pick trips',
          data: null,
        };
      }
      const autoTripConfig = await this.configurationService.getConfigValue(
        'AUTO_TRIP_END',
        tripData.orgID,
      );
      if (autoTripConfig !== 'On') {
        throw new BadRequestException(
          'Auto trip end config is not enabled for this organization.',
        );
      }
      const geoRadiusConfig = await this.configurationService.getConfigValue(
        'Auto_TripEnd_Radius_Meter',
        tripData.orgID,
      );

      if (!geoRadiusConfig) {
        throw new BadRequestException(
          'Auto trip geofence radius config not found for this organization.',
        );
      }
      const unmarkedAttendance = await this.tripRequestModel.count({
        where: {
          tripID: tripID,
          attendance: null, // attendance not marked
        },
      });

      if (unmarkedAttendance > 0) {
        throw new BadRequestException(
          'Attendance must be marked for all employees before completeting the trip.',
        );
      }
      const org = await this.organizationModel.findOne({
        where: { id: tripData.orgID },
        attributes: ['geoCode'],
      });

      if (!org) {
        throw new BadRequestException('Organization not found for this trip.');
      }

      const [orgLat, orgLng] = org.geoCode.split(',').map(Number);

      // Get Last GPS Location
      const apiUrl = this.configService.get('GPS_SERVER_API_URL');
      const GPS_API_KEY = this.configService.get('GPS_SERVER_API_KEY');
      const locationResponse = await axios.get(
        `${apiUrl}/geocode/getLastLocation?tripId=${tripID}`,
        {
          headers: { 'gps-api-key': GPS_API_KEY },
          timeout: 10000,
        },
      );
      const lastLocation = locationResponse?.data?.data;

      if (!lastLocation?.geocode) {
        // this.logger.log(
        //   `Auto trip end skipped. No GPS location found for trip ${tripID}`,
        // );
        // return;
        return {
          message: `Auto trip end skipped. No GPS location found for trip ${tripID}`,
          data: null,
        };
      }

      const [currentLat, currentLng] = lastLocation.geocode
        .split(',')
        .map(Number);

      // Calculate Distance to check if within org premise
      const distance = await this.googleMapService.haversineDistance(
        currentLat,
        currentLng,
        orgLat,
        orgLng,
      );

      // const geoRadius = 0.15; // 150 meters
      // Convert meters to kilometers
      const geoRadius = Number(geoRadiusConfig) / 1000;
      if (distance > geoRadius) {
        // this.logger.log(
        //   `Auto trip end skipped. Vehicle outside geofence. Distance: ${distance} km`,
        // );
        // return;
        return {
          message: `Auto trip end skipped. Vehicle outside geofence.`,
          data: null,
        };
      }
      // Call complete trip fn
      // await this.completeTrip( tripInput, user);
      this.logger.log(
        `Vehicle inside geofence. Auto trip end will trigger in 30 seconds for trip ${tripID}`,
      );
      setTimeout(async () => {
        try {
          await this.completeTrip(tripInput, user);
          this.logger.log(`Trip ${tripID} auto completed after 30 seconds.`);
        } catch (err) {
          this.logger.error(`Auto Trip End failed for trip ${tripID}`, err);
        }
      }, 30000);
      return {
        message: `Vehicle inside organization geofence. Auto trip end will trigger in 30 seconds for trip ${tripID}`,
        data: null,
      };
    } catch (error: any) {
      this.logger.error('Auto Trip End Error:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to automatically complete trip',
      );
    }
  }

  async findOne(id: number): Promise<Trip> {
    try {
      const trip = await this.tripModel.findByPk(id, {
        attributes: [
          'id',
          'seats',
          'orgID',
          'vendorID',
          'status',
          'driverID',
          'spock',
          'employees', // Make sure employees field is included
          'shiftTime',
          'date',
          'pickDrop',
          'estimatedDistance',
        ],
        include: [
          {
            model: Driver,
            as: 'driver',
          },
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name', 'code', 'phone'],
          },
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo', 'model'],
          },
          {
            model: TripRequest,
            as: 'tripEmployees',
            attributes: ['id', 'employeeID', 'attendance', 'attendanceTime'],
            include: [
              {
                model: Employee,
                as: 'employee',
                attributes: ['id', 'employeeCode', 'phone', 'address'],
              },
            ],
          },
        ],
      });

      if (!trip) {
        throw new NotFoundException('Trip not found');
      }

      return trip;
    } catch (error) {
      this.logger.error('Error finding trip:', error);
      throw error;
    }
  }

  /**
   * A vendor's tenant key is vendorID, full stop - Trips.vendorID is a direct
   * column. The org axis is for org-side principals, who carry no vendorID.
   * Vendor must be its own branch checked FIRST: only 3 of 8 live vendor
   * sessions carry an orgID (it is set only by vendor-organization-switch),
   * so requiring one would 404 every trip for the other 5. The 3 that carry
   * both still resolve on the vendor branch, which is correct - a vendor
   * never needs org-wide trip visibility.
   */
  private assertTripVisible(trip: Trip, user: any): void {
    if (user?.userType === UserType.SuperAdmin) return;
    // Both sides are BIGINT read through Sequelize, which the pg driver hands
    // back as a string, so they are compared as strings - same rationale as
    // trip-actuals.service.ts:418-431.
    if (isPresent(user?.vendorID)) {
      if (String(trip.vendorID) === String(user.vendorID)) return;
      throw new NotFoundException('Trip not found');
    }
    if (isPresent(user?.orgID) && String(trip.orgID) === String(user.orgID)) {
      return;
    }
    throw new NotFoundException('Trip not found');
  }

  /**
   * Tenant-scoped wrapper for the two id-addressed HTTP routes.
   *
   * findOne itself stays unscoped on purpose: it is a shared findByPk with 17
   * callers - 4 in this file plus trip-request.service, mob.trip-request.service,
   * driver.trip.services, trip-actuals.service and ivr-calling.service. Many run
   * as a driver or from IVR, where the session carries neither orgID nor
   * vendorID, so a predicate inside findOne would deny them. Tenancy is enforced
   * per caller instead - same placement as trip-actuals.service.ts:418-431.
   */
  async findOneForUser(id: number, user: any): Promise<Trip> {
    const trip = await this.findOne(id);
    this.assertTripVisible(trip, user);
    return trip;
  }

  async getCordonLastLocation(
    tripId: number,
    user: any,
  ): Promise<{
    imei: string;
    source: 'device';
    locations: GpsPoint[];
  }> {
    const trip = await this.tripModel.findOne({
      where: this.buildCordonTripScope(tripId, user),
      attributes: ['id', 'orgID'],
      include: [
        {
          model: Cab,
          as: 'cab',
          attributes: ['id', 'imei'],
        },
      ],
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (!trip.cab) {
      throw new NotFoundException('No vehicle assigned to this trip');
    }

    if (!trip.cab.imei) {
      throw new NotFoundException('Vehicle has no GPS device registered');
    }

    const locations = await this.cordonGpsApiService.getLastLocationByImei(
      trip.orgID,
      trip.cab.imei,
    );

    return {
      imei: trip.cab.imei,
      source: 'device',
      locations,
    };
  }

  // Org scoping for the single-trip cordon reads. Mirrors the batch endpoint's
  // rule (getCordonLastLocationsBatch): SuperAdmin sees any trip, everyone else
  // is confined to their own org. A non-SuperAdmin with no resolvable orgID is
  // rejected outright rather than scoped by `orgID: null` - Trip.orgID is a
  // bare @Column and therefore nullable, so an IS NULL scope would still match
  // any org-less trip. Same 'Trip not found' wording as the miss below, so the
  // response does not reveal whether the id exists.
  private buildCordonTripScope(tripId: number, user: any): any {
    if (user?.userType === UserType.SuperAdmin) {
      return { id: tripId };
    }

    if (!isPresent(user?.orgID)) {
      throw new NotFoundException('Trip not found');
    }

    return { id: tripId, orgID: user.orgID };
  }

  async getCordonTrail(
    tripId: number,
    user: any,
  ): Promise<{
    imei: string;
    source: 'device';
    from: string;
    to: string;
    locations: GpsPoint[];
  }> {
    const trip = await this.tripModel.findOne({
      where: this.buildCordonTripScope(tripId, user),
      attributes: ['id', 'orgID'],
      include: [
        {
          model: Cab,
          as: 'cab',
          attributes: ['id', 'imei'],
        },
        {
          model: TripActual,
          as: 'tripActual',
          attributes: [
            'actualStartDate',
            'actualStartTime',
            'actualEndDate',
            'actualEndTime',
          ],
        },
      ],
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (!trip.cab) {
      throw new NotFoundException('No vehicle assigned to this trip');
    }

    if (!trip.cab.imei) {
      throw new NotFoundException('Vehicle has no GPS device registered');
    }

    const actual = trip.tripActual;
    if (
      !actual ||
      !actual.actualStartDate ||
      !actual.actualStartTime ||
      !actual.actualEndDate ||
      !actual.actualEndTime
    ) {
      throw new BadRequestException(
        'Trip does not have complete actual start/end data yet',
      );
    }

    const from = `${actual.actualStartDate} ${actual.actualStartTime}`;
    const to = `${actual.actualEndDate} ${actual.actualEndTime}`;

    const locations = await this.cordonGpsApiService.getTrailByImei(
      trip.orgID,
      trip.cab.imei,
      from,
      to,
    );

    return {
      imei: trip.cab.imei,
      source: 'device',
      from,
      to,
      locations,
    };
  }

  async getCordonLastLocationsBatch(
    tripIds: string[],
    user: any,
  ): Promise<{
    data: Array<
      { tripId: string; imei: string; source: 'device' } & Partial<GpsPoint>
    >;
    missing: Array<{
      tripId: string;
      reason: 'NOT_FOUND' | 'NO_CAB' | 'NO_IMEI' | 'NO_DATA';
    }>;
  }> {
    const isSuperAdmin = user?.userType === UserType.SuperAdmin;
    const where: any = { id: tripIds };
    if (!isSuperAdmin) {
      if (!isPresent(user?.orgID)) {
        return {
          data: [],
          missing: tripIds.map((tripId) => ({
            tripId,
            reason: 'NOT_FOUND' as const,
          })),
        };
      }
      where.orgID = user.orgID;
    }

    const trips = await this.tripModel.findAll({
      where,
      attributes: ['id'],
      include: [
        {
          model: Cab,
          as: 'cab',
          attributes: ['id', 'imei'],
        },
      ],
    });

    const foundById = new Map(trips.map((trip) => [String(trip.id), trip]));
    const missing: Array<{
      tripId: string;
      reason: 'NOT_FOUND' | 'NO_CAB' | 'NO_IMEI' | 'NO_DATA';
    }> = [];
    const imeiToTripIds = new Map<string, string[]>();

    for (const tripId of tripIds) {
      const trip = foundById.get(tripId);
      if (!trip) {
        // Either the id doesn't exist, or (non-SuperAdmin) it belongs to
        // another org and was excluded by the where.orgID filter above.
        // Kept distinct from NO_CAB so an authorization mismatch is visible
        // during debugging instead of reading as "trip has no vehicle."
        missing.push({ tripId, reason: 'NOT_FOUND' });
        continue;
      }
      if (!trip.cab) {
        missing.push({ tripId, reason: 'NO_CAB' });
        continue;
      }
      if (!trip.cab.imei) {
        missing.push({ tripId, reason: 'NO_IMEI' });
        continue;
      }
      const list = imeiToTripIds.get(trip.cab.imei) ?? [];
      list.push(tripId);
      imeiToTripIds.set(trip.cab.imei, list);
    }

    const imeis = [...imeiToTripIds.keys()];
    const chunks: string[][] = [];
    for (let i = 0; i < imeis.length; i += 100) {
      chunks.push(imeis.slice(i, i + 100));
    }

    const results = await Promise.allSettled(
      chunks.map((chunkImeis) =>
        this.cordonGpsApiService.getLastLocationsByImeis(chunkImeis),
      ),
    );

    const data: Array<
      { tripId: string; imei: string; source: 'device' } & Partial<GpsPoint>
    > = [];

    results.forEach((result, idx) => {
      const chunkImeis = chunks[idx];
      if (result.status === 'rejected') {
        for (const imei of chunkImeis) {
          for (const tripId of imeiToTripIds.get(imei) ?? []) {
            missing.push({ tripId, reason: 'NO_DATA' });
          }
        }
        return;
      }
      const rowsByDeviceId = new Map(
        (result.value.data ?? []).map((row) => [row.device_id, row]),
      );
      for (const imei of chunkImeis) {
        const row = rowsByDeviceId.get(imei);
        const mapped = row ? cordonBatchPointToGpsPoint(row) : null;
        const tripIdsForImei = imeiToTripIds.get(imei) ?? [];
        if (!mapped) {
          for (const tripId of tripIdsForImei) {
            missing.push({ tripId, reason: 'NO_DATA' });
          }
          continue;
        }
        for (const tripId of tripIdsForImei) {
          data.push({ tripId, imei, source: 'device', ...mapped });
        }
      }
    });

    return { data, missing };
  }

  async deleteEmployeeFromTrip(
    updateTripInput: any,
    user: any,
  ): Promise<GenericResponse<null>> {
    try {
      const cabWaitingTimeConfigDelete =
        await this.configurationService.getMultipleConfigValues(
          ['Cab waiting time'],
          { orgID: user.orgID },
        );
      const { 'Cab waiting time': cabWaitingTimeBuffer } =
        cabWaitingTimeConfigDelete?.data || {};
      if (updateTripInput?.trip?.lockStatus !== Status.Active) {
        // Trip is unlocked - remove employee completely
        const updatedTripData = {
          ...updateTripInput?.trip,
          employees: updateTripInput?.trip.employees.filter(
            (emp) => emp.id !== updateTripInput?.employee.id,
          ),
        };
        //Calculate distance, time & legs
        const organization = await this.organizationService.findOne(
          user?.orgID,
        );
        let origin, destination, waypoints;

        if (updateTripInput?.trip?.pickDrop === 'Pick') {
          origin = updatedTripData?.employees[0]?.homepoint; // First employee
          waypoints = updatedTripData?.employees
            .slice(1)
            .map((emp) => emp.homepoint)
            .filter((point) => point); // Other employees
          destination = organization?.data?.geoCode; // Office
        } else {
          origin = organization?.data?.geoCode; // Office
          waypoints = updatedTripData?.employees
            .slice(0, updatedTripData?.employees.length - 1)
            .map((emp) => emp.homepoint); // Employees
          destination =
            updatedTripData?.employees[updatedTripData?.employees.length - 1]
              ?.homepoint; // Last employee
        }

        const cabRouteResponse = await this.googleMapService.calculateCabRoute(
          origin,
          destination,
          waypoints,
        );
        //End of calculation

        // Distance-based buffer lookup
        const rawBufferDelete = await this.configurationService.getConfigValue(
          updateTripInput?.trip?.pickDrop === 'Pick'
            ? 'Pick Buffer'
            : 'Drop Buffer',
          user.orgID,
        );
        const bufferMinutesDelete = getBufferForDistance(
          parseBufferConfig(rawBufferDelete),
          cabRouteResponse?.totalDistanceKm ?? 0,
        );
        const arrivalTimeBuffer =
          updateTripInput?.trip?.pickDrop === 'Pick' ? bufferMinutesDelete : 0;
        const dropTimeBuffer =
          updateTripInput?.trip?.pickDrop === 'Drop' ? bufferMinutesDelete : 0;

        const employeesWithEstTime =
          await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
            updateTripInput?.trip?.pickDrop,
            updateTripInput?.trip?.shiftTime,
            cabRouteResponse?.legs,
            updatedTripData?.employees,
            String(arrivalTimeBuffer),
            String(dropTimeBuffer),
            String(cabWaitingTimeBuffer),
          );
        await this.tripModel.update(
          {
            employees: employeesWithEstTime, // Update with estimated times
            estimatedOccupancy: updatedTripData.spock
              ? updatedTripData?.employees?.length + 1
              : updatedTripData?.employees?.length,
            estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
            routeLegs: cabRouteResponse?.legs,
          },
          { where: { id: updateTripInput?.trip?.id }, returning: true },
        );

        // Remove trip assignment from TripRequest
        await this.tripRequestService.updateTripID(
          [updateTripInput?.employee?.tripRequestID],
          user,
        );

        return {
          message: 'Employee removed successfully',
          data: null,
        };
      } else {
        // Trip is locked - mark as no show

        // 1. First update the TripRequest model to mark noShow = true
        await this.tripRequestService.markNoShow(
          [updateTripInput?.employee?.tripRequestID],
          user,
        );

        // 2. Get the updated TripRequest to get the latest data
        const updatedTripRequest = await this.tripRequestService.findOne(
          updateTripInput?.employee?.tripRequestID,
          user,
        );

        // 3. Update the Trip model's employees array to reflect the noShow status
        const updatedEmployees = updateTripInput?.trip.employees.map((emp) => {
          if (emp.id === updateTripInput?.employee.id) {
            return {
              ...emp,
              noShow: true,
              // Update with any other fields from TripRequest if needed
              attendance: updatedTripRequest?.data?.attendance || false,
              attendanceTime: updatedTripRequest?.data?.attendanceTime || null,
              attendanceMode: updatedTripRequest?.data?.attendanceMode || null,
            };
          }
          return emp;
        });

        const updatedTripData = {
          ...updateTripInput?.trip,
          employees: updatedEmployees,
        };

        // 4. Update the Trip model with the updated employees array
        await this.tripModel.update(
          { employees: updatedTripData?.employees },
          { where: { id: updateTripInput?.trip?.id }, returning: true },
        );

        // Event log for this action is already written by markNoShow() at
        // step 1. This second log was a duplicate with a broken diff —
        // payload was the raw TripRequest (id = tripRequestID) and
        // requestPayload was the Trip.employees[] entry (id = employeeID);
        // with no changeJSON, the auto-diff fell back to the one key name
        // both objects happened to share ("id"), producing a nonsense row
        // like "Id: 208980 → 4688". Removed rather than repaired.

        return {
          message: 'Employee marked no show successfully',
          data: null,
        };
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // Add this new service method to your existing trip service

  async markEmployeeNoShowByDriver(
    markNoShowInput: DriverMarkNoShowDto,
    user: any,
  ): Promise<GenericResponse<null>> {
    try {
      const { tripId, employeeId } = markNoShowInput;
      // 1. Fetch the full trip data using the trip ID
      const tripData = await this.findOne(parseInt(tripId));
      if (!tripData) {
        throw new BadRequestException('Trip not found');
      }
      // 2. Find the employee in trip's employees array using employeeId
      const employeeInTrip = tripData.employees?.find(
        (emp) => emp.id === employeeId,
      );
      if (!employeeInTrip) {
        throw new BadRequestException('Employee not found in this trip');
      }
      // 3. Get tripRequestID from employee data
      const tripRequestID = employeeInTrip.tripRequestID;
      if (!tripRequestID) {
        throw new BadRequestException('Trip request ID not found for employee');
      }
      // 4. Check current status before doing anything
      const existingRequest = await this.tripRequestModel.findByPk(
        tripRequestID,
      );
      if (existingRequest?.status === Status.EmployeeSelfNoShow) {
        throw new BadRequestException(
          'This employee already self-cancelled this trip and cannot be marked no-show by the driver.',
        );
      }
      // 5. Get current time for attendance
      const currentTime = moment().format('HH:mm:ss');
      // 6. Update the employee in trip's employees array
      const updatedEmployees = tripData.employees.map((emp) => {
        if (emp.id === employeeId) {
          return {
            ...emp,
            noShow: true,
            attendance: false,
            attendanceTime: currentTime,
            attendanceMode: null,
          };
        }
        return emp;
      });
      // 7. Update TripRequest model directly
      const [affectedCount] = await this.tripRequestModel.update(
        {
          noShow: true,
          attendance: false,
          attendanceTime: currentTime,
          attendanceMode: null,
        },
        {
          where: {
            id: tripRequestID,
            status: { [Op.ne]: Status.EmployeeSelfNoShow },
          },
          returning: true,
        },
      );
      if (affectedCount === 0) {
        throw new BadRequestException('Failed to update trip request');
      }
      // ── No-show counter + login-block check ──────────────────────────────
      await this.tripRequestService.processNoShowForCounter(
        BigInt(employeeId),
        true,
        existingRequest.orgID,
      );
      // 8. Update the Trip model with the updated employees array
      await this.tripModel.update(
        { employees: updatedEmployees },
        { where: { id: tripId }, returning: true },
      );
      // 9. Create event log for the no show action
      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripRequestID,
        authID: user.id,
        updatedBy: user.name,
        payload: {
          noShow: true,
          attendance: false,
          attendanceTime: currentTime,
          attendanceMode: null,
        },
        requestPayload: { tripId, employeeId },
        customDescription: 'marked as no show by driver',
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: `Employee marked as no-show successfully`,
        data: null,
      };
    } catch (error: any) {
      this.logger.error('Error marking employee no-show:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to mark employee as no-show',
      );
    }
  }

  async updateEmployeesArray(
    tripId: string,
    updatedEmployees: any[],
  ): Promise<void> {
    try {
      await this.tripModel.update(
        {
          employees: updatedEmployees,
        },
        {
          where: { id: tripId },
          returning: true,
        },
      );

      // Verify the update by fetching the trip again
      const verifyTrip = await this.tripModel.findByPk(tripId, {
        attributes: ['id', 'employees'],
      });

      if (verifyTrip) {
      }
    } catch (error) {
      this.logger.error('Error updating trip employees array:', error);
      throw new InternalServerErrorException('Failed to update trip employees');
    }
  }

  async removeEmployeeFromTrips(tripIDs, user: any): Promise<any> {
    try {
      const tripsToUpdate = await this.tripModel.findAll({
        where: { id: tripIDs },
        attributes: ['id', 'employees'], // Fetching only relevant fields
      });

      const updatedTrips = tripsToUpdate.map((trip) => {
        // Remove the employee entry from the JSON field
        const updatedEmployees = trip.employees.filter(
          (emp) => emp.id !== user?.employeeID,
        );
        return {
          tripID: trip.id,
          employees: updatedEmployees,
        };
      });
      // // Perform bulk update
      await Promise.all(
        updatedTrips.map(async (trip) => {
          await this.tripModel.update(
            { employees: trip.employees },
            { where: { id: trip.tripID } },
          );
        }),
      );
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getVendorTripCounts(
    startDate: string,
    endDate: string,
    user: any,
  ): Promise<GenericResponse<any>> {
    try {
      const whereClause: any = {
        orgID: user.orgID,
      };

      if (startDate && endDate) {
        whereClause.date = {
          [sequelize.Op.between]: [startDate, endDate],
        };
      }
      const vendorTrips = await this.tripModel.findAll({
        where: whereClause,
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['name', 'code'],
            required: true,
          },
        ],
        raw: true,
      });
      const vendorTripCounts = vendorTrips.reduce((acc, trip) => {
        const vendorCode = trip['vendor.code'];
        if (!acc[vendorCode]) {
          acc[vendorCode] = {
            name: trip['vendor.name'],
            code: vendorCode,
            'Trip Count': 0,
          };
        }
        acc[vendorCode]['Trip Count']++;
        return acc;
      }, {});

      const result = Object.values(vendorTripCounts);
      return {
        message: 'Vendor trip count retrieved successfully',
        data: result,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async curruntDayTripsCount(): Promise<GenericResponse<any>> {
    try {
      const today = moment().format('YYYY-MM-DD');
      const tripsCount = await this.tripModel.count({
        where: {
          date: today,
          status: TripStatus.Ongoing,
        },
      });

      return {
        message: 'Current day trips count retrieved successfully',
        data: { count: tripsCount },
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getTripDelayCounts(startDate?: string, endDate?: string, user?: any) {
    try {
      const whereClause: any = {
        orgID: user.orgID,
      };
      if (startDate && endDate) {
        whereClause.date = {
          [Op.between]: [startDate, endDate],
        };
      }
      const trips = await Trip.findAll({
        where: whereClause,
        include: [
          {
            model: TripActual,
            as: 'tripActual',
            required: true,
          },
        ],
      });

      const shiftTimeStats = new Map<
        string,
        { onTime: number; delayed: number }
      >();
      trips.forEach((trip) => {
        if (!trip.shiftTime) {
          return;
        }
        const shiftTime = trip.shiftTime;
        const actualStartTime = trip.tripActual.actualStartTime;
        const actualEndTime = trip.tripActual.actualEndTime;

        if (!shiftTimeStats.has(shiftTime)) {
          shiftTimeStats.set(shiftTime, { onTime: 0, delayed: 0 });
        }
        const stats = shiftTimeStats.get(shiftTime);
        const shiftMinutes = this.timeToMinutes(shiftTime);
        const startMinutes = actualStartTime
          ? this.timeToMinutes(actualStartTime)
          : null;
        const endMinutes = actualEndTime
          ? this.timeToMinutes(actualEndTime)
          : null;

        let isDelayed = false;
        if (trip.pickDrop === PickDrop.Pick) {
          if (endMinutes !== null && endMinutes > shiftMinutes) {
            isDelayed = true;
          }
        } else if (trip.pickDrop === PickDrop.Drop) {
          if (startMinutes !== null && startMinutes > shiftMinutes + 30) {
            isDelayed = true;
          }
        }
        if (isDelayed) {
          stats.delayed++;
        } else {
          stats.onTime++;
        }
      });

      const result = Array.from(shiftTimeStats.entries()).map(
        ([shiftTime, stats]) => ({
          shiftTime,
          'On-Time': stats.onTime,
          Delayed: stats.delayed,
        }),
      );
      return result;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  private timeToMinutes(timeStr: string): number {
    if (!timeStr) return 0;

    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  async getCompletedTripCounts(
    startDate?: string,
    endDate?: string,
    user?: any,
  ) {
    try {
      const whereClause: any = {
        orgID: user.orgID,
      };
      if (startDate && endDate) {
        whereClause.date = {
          [Op.between]: [startDate, endDate],
        };
      }
      const completedCount = await Trip.count({
        where: {
          ...whereClause,
          status: TripStatus.Completed,
        },
      });
      const notCompletedCount = await Trip.count({
        where: {
          ...whereClause,
          status: {
            [Op.not]: TripStatus.Completed,
          },
        },
      });

      return [
        { name: 'Completed', count: completedCount },
        { name: 'Not Completed', count: notCompletedCount },
      ];
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getShiftTripDetails(shiftTime?: string, date?: string, user?: any) {
    try {
      const trips = await this.tripModel.findAndCountAll({
        where: {
          shiftTime: shiftTime,
          date: date,
          orgID: user?.orgID,
        },
        include: [
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name'],
          },
        ],
        order: [['id', 'ASC']],
        attributes: [
          'id',
          'vendorID',
          'vendorCode',
          'date',
          'shiftTime',
          'pickDrop',
          'employees',
          'tripLocation',
          'status',
        ],
      });

      const counts = {
        completed: 0,
        pending: 0,
        ongoing: 0,
        employeesInTransit: 0,
      };

      trips.rows.forEach((trip) => {
        if (trip.status === TripStatus.Completed) counts.completed++;
        if (
          trip.status === TripStatus.Confirmed ||
          trip.status === TripStatus.Pending
        )
          counts.pending++;
        if (trip.status === TripStatus.Ongoing) {
          counts.ongoing++;
          counts.employeesInTransit += Array.isArray(trip.employees)
            ? trip.employees.length
            : 0;
        }
      });

      if (trips)
        return {
          totalItems: trips.count,
          items: trips.rows,
          counts: counts,
        };
      else throw new NotFoundException('Invalid date and time');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getShiftTripDetailsByVendorID(
    shiftTime?: string,
    date?: string,
    user?: any,
    orgID?: any,
  ) {
    try {
      const whereCondition: any = {
        shiftTime,
        date,
        vendorID: user?.vendorID,
      };

      if (orgID) {
        whereCondition.orgID = orgID;
      }

      // const date = new Date()
      // const today = date.toISOString().split('T')[0];
      const trips = await this.tripModel.findAndCountAll({
        where: whereCondition,
        include: [
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name'],
          },
        ],
        order: [['id', 'ASC']],
        attributes: [
          'id',
          'vendorID',
          'vendorCode',
          'date',
          'shiftTime',
          'pickDrop',
          'employees',
          'tripLocation',
          'status',
        ],
      });

      const counts = {
        completed: 0,
        pending: 0,
        ongoing: 0,
        employeesInTransit: 0,
      };

      trips.rows.forEach((trip) => {
        if (trip.status === TripStatus.Completed) counts.completed++;
        if (
          trip.status === TripStatus.Confirmed ||
          trip.status === TripStatus.Pending
        )
          counts.pending++;
        if (trip.status === TripStatus.Ongoing) {
          counts.ongoing++;
          counts.employeesInTransit += Array.isArray(trip.employees)
            ? trip.employees.length
            : 0;
        }
      });

      if (trips)
        return {
          totalItems: trips.count,
          items: trips.rows,
          counts: counts,
        };
      else throw new NotFoundException('Invalid date and time');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async updateCabArrivalTime(
    employeeId: string,
    cabArrivalTime: string,
    tripId: string,
  ): Promise<any> {
    try {
      // Find the trip by ID
      const trip = await this.tripModel.findByPk(tripId, {
        attributes: ['id', 'employees'],
      });

      if (!trip) {
        throw new NotFoundException('Trip not found');
      }

      // Update the employee's cab arrival time
      const updatedEmployees = trip.employees.map((emp) => {
        if (emp.id === employeeId) {
          return { ...emp, cabArrivalTime: cabArrivalTime };
        }
        return emp;
      });

      // Update the trip with the modified employees array
      await this.tripModel.update(
        { employees: updatedEmployees },
        { where: { id: tripId } },
      );

      return {
        message: 'Cab arrival time updated successfully',
        data: updatedEmployees,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async tripCountByShiftTime(
  //   user?: any,
  //   shiftDate?: string,
  //   shiftTime?: string,
  //   pickDrop?: string,
  //   orgID?: string,
  // ) {
  //   try {
  //     const whereClause: any = {
  //       vendorID: user?.vendorID,
  //     };

  //     if (shiftDate) whereClause.date = shiftDate;
  //     if (shiftTime) whereClause.shiftTime = shiftTime;
  //     if (pickDrop) whereClause.pickDrop = pickDrop;
  //     if (orgID) whereClause.orgID = orgID;

  //     const trips = await this.tripModel.findAndCountAll({
  //       where: whereClause,
  //       attributes: ['shiftTime', 'pickDrop'],
  //       raw: true,
  //        include: [
  //         {
  //           model: Organization,
  //           as: 'org',
  //           attributes: ['id', 'name'],
  //         },
  //       ],
  //     });

  //     const groupedResult = {};

  //     trips.rows.forEach((trip) => {
  //       const key = `${trip.shiftTime}_${trip.pickDrop}`;

  //       if (!groupedResult[key]) {
  //         groupedResult[key] = {
  //           shiftTime: trip.shiftTime,
  //           pickDrop: trip.pickDrop,
  //           tripCount: 0,
  //         };
  //       }

  //       groupedResult[key].tripCount += 1;
  //     });

  //     return Object.values(groupedResult);
  //   } catch (error) {
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async tripCountByShiftTime(
    user?: any,
    shiftDate?: string,
    shiftTime?: string,
    pickDrop?: string,
    orgID?: string,
  ) {
    try {
      const whereClause: any = {
        vendorID: user?.vendorID,
      };

      if (shiftDate) whereClause.date = shiftDate;
      if (shiftTime) whereClause.shiftTime = shiftTime;
      if (pickDrop) whereClause.pickDrop = pickDrop;
      if (orgID) whereClause.orgID = orgID;

      const trips = await this.tripModel.findAll({
        where: whereClause,
        attributes: [
          'shiftTime',
          'pickDrop',
          [Sequelize.fn('COUNT', Sequelize.literal('1')), 'tripCount'],
        ],
        group: ['shiftTime', 'pickDrop'],
        order: [[Sequelize.cast(Sequelize.col('shiftTime'), 'time'), 'ASC']],
        raw: true,
      });

      return trips;
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async markEmployeeNearByLocation(
    markNearbyInput: DriverMarkNearbyDto,
    user: any,
  ): Promise<GenericResponse<null>> {
    try {
      const { tripId, employeeId, location } = markNearbyInput;

      // 1. Fetch the full trip data using the trip ID
      const tripData = await this.findOne(parseInt(tripId));
      if (!tripData) {
        throw new BadRequestException('Trip not found');
      }

      if (tripData.driverID !== user?.driverID) {
        throw new BadRequestException(
          'Access denied: This trip is not associated with you.',
        );
      }

      // 2. Find the employee in trip's employees array using employeeId
      const employeeInTrip = tripData.employees?.find(
        (emp) => emp.id === employeeId,
      );

      if (!employeeInTrip) {
        throw new BadRequestException('Employee not found in this trip');
      }

      // 3. Get current time for attendance
      const currentTime = moment().format('HH:mm:ss');

      // 4. Update the employee in trip's employees array
      const updatedEmployees = tripData.employees.map((emp) => {
        if (emp.id === employeeId) {
          return {
            ...emp,
            nearbyTime: currentTime,
            nearbyLocation: location,
          };
        }
        return emp;
      });

      // 5. Update the Trip model with the updated employees array
      await this.tripModel.update(
        { employees: updatedEmployees },
        { where: { id: tripId }, returning: true },
      );

      // 6. Create event log for the no show action
      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripId,
        authID: user.id,
        updatedBy: user.name,
        payload: {
          nearbyTime: currentTime,
          nearbyLocation: location,
        },
        requestPayload: { tripId, employeeId },
        customDescription: 'Employee nearby location marked by driver',
        user,
      };
      await this.eventlogService.create(eventLog);

      return {
        message: `Employee nearby location marked successfully`,
        data: null,
      };
    } catch (error: any) {
      this.logger.error('Error marking employee nearby location:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to mark employee nearby location',
      );
    }
  }

  async getCabArrivalDelayCounts(startDate?: any, endDate?: any, user?: any) {
    try {
      const where: any = {
        orgID: user.orgID,
        markCabReached: true,
      };
      if (startDate && endDate) {
        where.date = {
          [Op.between]: [startDate, endDate],
        };
      }
      const trips = await this.tripRequestModel.findAll({
        where,
        attributes: [
          'date',
          'pickDrop',
          'pickUpTime',
          'dropTime',
          'cabArrivedAt',
          'attendanceTime',
          'cabWaitingTime',
        ],
        include: [
          {
            model: Trip,
            as: 'trip',
            attributes: ['status', 'estimatedStartDateTime'],
            where: {
              status: {
                [Op.in]: ['Ongoing', 'Completed'],
              },
            },
            required: true,
          },
        ],
      });

      const result = {
        onTime: 0,
        driverLate: 0,
        empLate: 0,
      };

      trips.forEach((row: any) => {
        const data = row.toJSON();

        let driverDelay: number | null = null;
        let employeeDelay: number | null = null;

        const datePart = moment(data.date).format('YYYY-MM-DD');
        const scheduledTime = data.pickDrop ? data.pickUpTime : data.dropTime;

        if (scheduledTime) {
          const scheduledDateTime = moment(
            `${datePart} ${scheduledTime}`,
            'YYYY-MM-DD HH:mm',
          );

          if (data.cabArrivedAt) {
            const cabTime = moment(data.cabArrivedAt);
            driverDelay = cabTime.diff(scheduledDateTime, 'minutes');
          }

          if (data.attendanceTime) {
            const attendanceTime = moment(
              data.attendanceTime,
              'YYYY-MM-DD HH:mm:ss',
            );
            if (data.pickDrop) {
              if (data.cabWaitingTime) {
                const waitingTime = moment(data.cabWaitingTime);
                employeeDelay = attendanceTime.diff(waitingTime, 'minutes');
              }
            } else {
              if (data.trip.estimatedStartDateTime) {
                const dropDateTime = moment(data.trip.estimatedStartDateTime);
                employeeDelay = attendanceTime.diff(dropDateTime, 'minutes');
              }
            }
            // employeeDelay = attendanceTime.diff(scheduledDateTime, 'minutes');
          }
        }

        // driver delay
        if (driverDelay !== null) {
          if (driverDelay < 0 || driverDelay === 0) result.onTime++;
          else result.driverLate++;
        }
        // // employee delay
        if (employeeDelay !== null) {
          if (employeeDelay < 0 || employeeDelay === 0) result.onTime++;
          else result.empLate++;
        }
        // if (driverDelay !== null && driverDelay > 0) {
        //   result.driverLate++;
        // } else if (employeeDelay !== null && employeeDelay > 0) {
        //   result.empLate++;
        // } else {
        //   result.onTime++;
        // }
      });
      return [
        { name: 'On Time', value: result.onTime },
        { name: 'Driver Delay', value: result.driverLate },
        { name: 'Employee Delay', value: result.empLate },
      ];
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async getTripsForSearch(
    searchTripFilter: any,
    startDate: any,
    endDate: any,
    user?: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        type,
        driverID,
        vendorID,
        employeeID,
        cabID,
        orgID,
        // startDate,
        // endDate,
        pickDrop,
        status,
        tripType,
        tripID,
      } = searchTripFilter;

      const finalOrgID = orgID ?? user.orgID;

      const tripWhereCondition: any = {
        orgID: finalOrgID,
        status: {
          [Op.ne]: Status.Cancelled,
        },
      };
      if (type === 'driver') {
        if (driverID) tripWhereCondition.driverID = driverID;
      }
      if (type === 'cab') {
        if (cabID) tripWhereCondition.cabID = cabID;
      }
      if (type === 'vendor') {
        if (vendorID) tripWhereCondition.vendorID = vendorID;
      }
      if (type === 'employee') {
        if (employeeID) {
          tripWhereCondition.employees = {
            [Op.contains]: [{ id: employeeID }],
          };
        }
      }
      // if (startDate && endDate) {
      //   tripWhereCondition.date = {
      //     [Op.between]: [startDate, endDate],
      //   };
      // }
      if (tripID) {
        // Trip ID search should be independent of date range
        tripWhereCondition.id = tripID;
      } else if (startDate && endDate) {
        tripWhereCondition.date = {
          [Op.between]: [startDate, endDate],
        };
      }
      if (pickDrop) {
        tripWhereCondition.pickDrop = pickDrop;
      }
      if (status) {
        tripWhereCondition.status = status;
      }
      // 'null' represents "Regular" (no special type).
      if (tripType) {
        if (tripType === 'null') {
          tripWhereCondition.emergencyType = null;
        } else {
          tripWhereCondition.emergencyType = tripType;
        }
      }
      const trips = await this.tripModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: tripWhereCondition,
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: [
              'id',
              'name',
              'code',
              'phone',
              'aadharNumber',
              'licenseNo',
            ],
          },
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name', 'code', 'phone'],
          },
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo', 'model'],
          },
          {
            model: Security,
            as: 'security',
            attributes: ['id', 'name'],
          },
          {
            model: TripActual,
            as: 'tripActual',
            attributes: [
              'id',
              'tripID',
              'actualDistance',
              'actualEndDate',
              'actualEndTime',
              'actualOccupancy',
              'actualStartDate',
              'actualStartTime',
            ],
          },
        ],
      });

      return {
        items: trips.rows,
        totalItems: trips.count,
      };
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async findTripForSearch(
    id: string,
    user?: any,
  ): Promise<GenericResponse<Trip>> {
    try {
      const whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.id = id;
      const trip = await this.tripModel.findOne({
        where: whereClause,
        include: [
          {
            model: Driver,
            as: 'driver',
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
            model: TripRequest,
            as: 'tripEmployees',
            attributes: [
              'id',
              'employeeID',
              'employeeCode',
              'attendance',
              'attendanceTime',
              'pickUpTime',
              'dropTime',
              'attendanceMode',
              'noShow',
              'ratings',
              'comments',
              'cabArrivedAt',
              'cabWaitingTime',
            ],
            include: [
              {
                model: Employee,
                as: 'employee',
                attributes: ['id', 'name', 'employeeCode', 'phone', 'address'],
              },
            ],
          },
          {
            model: TripActual,
            as: 'tripActual',
          },
          {
            model: Alert,
            as: 'alert',
          },
        ],
      });
      if (trip)
        return {
          message: 'Trip found',
          data: trip,
        };
      else throw new NotFoundException('Trip not found');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllVendorShiftTime(
    user?: any,
    startDate?: string,
    endDate?: string,
  ) {
    try {
      const whereClause: any = {
        vendorID: user.vendorID,

        ...(startDate &&
          endDate && {
            date: {
              [Op.between]: [startDate, endDate],
            },
          }),
      };
      const shiftTimes = await Trip.findAll({
        attributes: [
          [col('Trip.shiftTime'), 'shiftTime'],
          [
            fn(
              'COUNT',
              fn(
                'DISTINCT',
                literal(
                  `CASE WHEN "Trip"."status" NOT IN ('Cancelled') THEN "Trip"."id" END`,
                ),
              ),
            ),
            'tripCount',
          ],
          [col('Trip.pickDrop'), 'pickDrop'],
          [
            fn('ARRAY_AGG', col('tripEmployees.emergencyType')),
            'emergencyTypes',
          ],
        ],
        where: whereClause,
        include: [
          {
            model: TripRequest,
            as: 'tripEmployees',
            attributes: [],
          },
        ],
        group: ['Trip.shiftTime', 'Trip.pickDrop'],
        raw: true,
      });
      return shiftTimes;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getEmployeeWiseTripDetails(
    filters: any,
    startDate: any,
    endDate: any,
    user?: any,
  ): Promise<{ items: any[]; totalItems: number }> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        orgID,
        pickDrop,
        tripType,
        status,
        employeeID,
        tripID,
      } = filters;

      const finalOrgID = orgID ?? user.orgID;

      const tripWhereCondition: any = {
        orgID: finalOrgID,
      };

      // if (startDate && endDate) {
      //   tripWhereCondition.date = { [Op.between]: [startDate, endDate] };
      // }

      // Trip ID search should be independent of date range
      if (tripID) {
        tripWhereCondition.id = tripID;
      } else if (startDate && endDate) {
        tripWhereCondition.date = { [Op.between]: [startDate, endDate] };
      }

      if (pickDrop) tripWhereCondition.pickDrop = pickDrop;
      if (status) tripWhereCondition.status = status;
      if (employeeID) {
        tripWhereCondition.employees = {
          [Op.contains]: [{ id: employeeID }],
        };
      }
      if (tripType) {
        if (tripType === 'null') {
          tripWhereCondition.emergencyType = null;
        } else {
          tripWhereCondition.emergencyType = tripType;
        }
      }

      const allTrips = await this.tripModel.findAll({
        where: tripWhereCondition,
        order: [[`${sortBy}`, `${sortOrder}`]],
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
        ],
      });

      // Step 2: Flatten trips → one record per employee
      const flatList: any[] = [];

      for (const trip of allTrips) {
        const employees: any[] = trip.employees ?? [];
        const tripEmployees: any[] = trip.tripEmployees ?? [];

        for (const emp of employees) {
          if (employeeID && emp.id !== employeeID) continue;
          if (tripID && String(trip.id) !== String(tripID)) continue;

          const tripRequest = tripEmployees.find(
            (te: any) => String(te.employeeID) === String(emp.id),
          );

          flatList.push({
            // Employee fields
            employeeID: emp.id,
            employeeName: emp.name,
            empCode: emp.empCode,
            gender: emp.gender,
            location: emp.location,
            address: emp.address,
            landmark: emp.landmark,
            homepoint: emp.homepoint,
            specialConsideration: emp.specialConsideration ?? null,
            cabArrivalTime: emp.cabArrivalTime ?? null,
            tripRequestID: emp.tripRequestID,

            // Attendance fields (from TripRequest)
            attendance: tripRequest?.attendance ?? null,
            attendanceTime: tripRequest?.attendanceTime ?? null,
            attendanceMode: tripRequest?.attendanceMode ?? null,
            pickUpTime: tripRequest?.pickUpTime ?? null,
            dropTime: tripRequest?.dropTime ?? null,
            cabArrivedAt: tripRequest?.cabArrivedAt ?? null,
            cabWaitingTime: tripRequest?.cabWaitingTime ?? null,
            noShow: tripRequest?.noShow ?? null,
            ratings: tripRequest?.ratings ?? null,
            comments: tripRequest?.comments ?? null,

            // Trip fields
            tripID: trip.id,
            routeNumber: trip.routeNumber,
            date: trip.date,
            shiftTime: trip.shiftTime,
            scheduledTime: trip.scheduledTime,
            plannedTime: trip.plannedTime,
            pickDrop: trip.pickDrop,
            status: trip.status,
            lockStatus: trip.lockStatus,
            seats: trip.seats,
            estimatedDistance: trip.estimatedDistance,
            estimatedCost: trip.estimatedCost,
            estimatedOccupancy: trip.estimatedOccupancy,
            estimatedStartDateTime: trip.estimatedStartDateTime,
            estimatedEndDateTime: trip.estimatedEndDateTime,
            emergencyType: trip.emergencyType ?? null,

            // Associations
            driver: trip.driver ?? null,
            cab: trip.cab ?? null,
            vendor: trip.vendor ?? null,
            tripActual: trip.tripActual ?? null,
          });
        }
      }

      // Step 3: Apply pagination on the flat list
      const totalItems = flatList.length;
      const pageNumber = Number(skip);
      const pageSize = Number(take);
      const paginatedItems = flatList.slice(
        pageNumber * pageSize,
        pageNumber * pageSize + pageSize,
      );

      return {
        items: paginatedItems,
        totalItems,
      };
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  private readonly ROUTE_CACHE_TTL_DAYS = 30;

  async getRouteCache(
    tripId: number,
    routeType: 'actual' | 'planned',
  ): Promise<{
    points: { lat: number; lng: number }[];
    waypointsHash: string;
  } | null> {
    const trip = await this.tripModel.findByPk(tripId, {
      attributes: ['id', 'routeCache'],
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const cached = (trip.routeCache as any)?.[routeType];
    if (!cached) {
      return null;
    }

    const cachedAt = moment(cached.cachedAt);
    const isStale =
      !cachedAt.isValid() ||
      moment().diff(cachedAt, 'days') >= this.ROUTE_CACHE_TTL_DAYS;

    if (isStale) {
      // Lazy invalidation: actually delete the stale entry rather than just
      // ignoring it, per the Directions API caching terms ("must delete the
      // cached ... values" after 30 days) - not just stop serving it.
      const updatedRouteCache = { ...((trip.routeCache as any) || {}) };
      delete updatedRouteCache[routeType];
      await this.tripModel.update({ routeCache: updatedRouteCache } as any, {
        where: { id: tripId },
      });
      return null;
    }

    return {
      points: cached.points,
      waypointsHash: cached.waypointsHash,
    };
  }

  async saveRouteCache(
    tripId: number,
    dto: SaveRouteCacheDto,
  ): Promise<GenericResponse<null>> {
    const trip = await this.tripModel.findByPk(tripId, {
      attributes: ['id', 'routeCache'],
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const updatedRouteCache = {
      ...((trip.routeCache as any) || {}),
      [dto.routeType]: {
        points: dto.points,
        waypointsHash: dto.waypointsHash,
        cachedAt: new Date().toISOString(),
      },
    };

    await this.tripModel.update({ routeCache: updatedRouteCache } as any, {
      where: { id: tripId },
    });

    return { message: 'Route cache saved', data: null };
  }

  async getRouteCacheMobile(tripId: number): Promise<any> {
    const trip = await this.tripModel.findByPk(tripId, {
      attributes: ['id', 'routeCache'],
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const actual = (trip.routeCache as any)?.actual;
    const planned = (trip.routeCache as any)?.planned;

    const routeType = actual ? 'actual' : 'planned';
    const cached = actual ?? planned;

    if (!cached) {
      return {
        cached: false,
        routeType,
        message:
          'Route cache data not yet stored. The route map may not have been opened yet, or the cached data may have expired after 30 days.',
        data: null,
      };
    }

    return {
      cached: true,
      routeType,
      message: `${
        routeType === 'actual' ? 'Actual' : 'Planned'
      } route cache data found`,
      data: cached,
    };
  }
}
