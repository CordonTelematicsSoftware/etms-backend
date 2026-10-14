import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { TripRequest } from '../models/trip-request.model';
import { CreateTripRequestInput } from '../dtos/create-trip-request-input.dto';
import {
  EmployeeType,
  RequestStatus,
  SortOrder,
  Status,
  TripStatus,
  UserType,
  EmergencyType,
  PickDrop,
} from 'src/shared/enums';
import { TripRequestFilterInput } from '../dtos/trip-request-filter-input.dto';
import {
  EmergencyTripRequestInput,
  EmployeeEmergencyTripRequestInput,
  UpdateTripRequestInput,
} from '../dtos/update-trip-request-input.dto';
import { EmployeeService } from 'src/employee/services/employee-service';
import * as moment from 'moment';
import 'moment-timezone';
import { col, fn, Op } from 'sequelize';
import { Employee } from 'src/employee/models/employee.model';
import * as XLSX from 'xlsx';
import { Sequelize } from 'sequelize-typescript';
import { Location } from 'src/location-management/locations/models/location.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { EmailService } from 'src/email/email.service';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { TripService } from 'src/trip-management/trip/services/trip.service';
import { generateOTP } from 'src/shared/utils/otp.utils';
import { MarkAttendanceInput } from '../dtos/mark-attendance-input.dto';
import { MarkDeboardInput } from '../dtos/mark-deboard-input.dto';
import { ETMSFilterInput } from 'src/employee/dtos/employeetriprequest-filter-input.dto';
import { DateTime } from 'luxon';
import { normalizeTime } from 'src/shared/utils/timeUtils';
import { RateTripDto } from '../dtos/rate-trip.dto';
import { NotificationDispatcherService } from 'src/notifications/services/notification-dispatcher.service';
import { NotificationChannel } from 'src/notifications/enums/notification-channel.enum';
import { DriverTripService } from 'src/trip-management/trip/services/driver.trip.services';
import { Authentication } from 'src/auth/models/authentication.model';
import { Organization } from 'src/organization/models/organization.model';
import { SessionService } from 'src/auth/services/session.service';

// Ops-page trip-request export ceiling. Sized against Lambda's 6 MB synchronous
// response payload (serverless-prod.yml deploys dist/lambda.handler behind API
// Gateway), not the browser-side XLSX build: at roughly 475 B/row — estimated,
// not measured, and officeLocation/employee.designation are unbounded text — a
// 10000-row response is ~4.75 MB.
//
// Payload is not the only ceiling. API Gateway also caps integration time at 29s
// regardless of the function's own timeout, and "TripRequests" has only a
// ("employeeID","date") index (50260817000000), so the orgID + date range this
// export actually issues is a sequential scan. A large org may time out before
// it ever approaches the payload limit; an (orgID,date) index is the fix, and is
// already parked as a TODO in trip-req-report-export.service.ts.
const EXPORT_ROW_CAP = 10000;

@Injectable()
export class TripRequestService {
  private logger = new Logger(TripRequestService.name);

  constructor(
    @InjectModel(TripRequest)
    private tripRequestModel: typeof TripRequest,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    @InjectModel(Authentication)
    private authModel: typeof Authentication,
    @Inject(forwardRef(() => DriverTripService))
    private readonly driverTripService: DriverTripService,
    private employeeService: EmployeeService,
    private emailService: EmailService,
    private tripService: TripService,
    private readonly sequelize: Sequelize,
    private eventlogService: EventLogService,
    private configService: ConfigurationService,
    private sessionService: SessionService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  async create(
    createTripRequestInput: CreateTripRequestInput,
    user?: any,
  ): Promise<GenericResponse<TripRequest>> {
    // Hoisted above the try block so the catch block's failure event log
    // can include the employee's name/code whenever the lookup succeeded
    // before whatever validation later failed. Stays undefined if the
    // employee lookup itself is what failed (or never ran).
    let employee: any;
    try {
      const organizationID =
        createTripRequestInput.selectedOrgID ?? user?.orgID;
      const employeeID =
        createTripRequestInput.guestEmployeeID ?? user?.employeeID;

      const { selectedDates, loginTime, logoutTime, status, emergencyType } =
        createTripRequestInput;

      const [configResponse, employeeResult] = await Promise.all([
        this.configService.getMultipleConfigValues(
          ['AUTO_APPROVAL_TRIP_REQUEST', 'LOWER_CUT_OFF'],
          { orgID: organizationID },
        ),
        this.employeeService.findOne(employeeID),
      ]);
      employee = employeeResult;
      if (!employee) {
        throw new BadRequestException('Employee not found.');
      }
      const {
        'Auto approval trip request': approvalType,
        'Lower cut off': lowerCutOff,
      } = configResponse?.data || {};

      const updatedStatus = approvalType === 'Yes' ? Status.Approved : status;

      const lowerCutOffValue = parseInt(lowerCutOff, 10);

      const currentDate = moment().startOf('day');
      if (!emergencyType) {
        for (const date of selectedDates) {
          const selectedDate = moment(date).startOf('day');
          const dateGap = selectedDate.diff(currentDate, 'days');
          if (dateGap < lowerCutOffValue) {
            // throw new BadRequestException(
            //   `Trip request cannot be created. The selected date ${selectedDate.format(
            //     'DD/MM/YYYY',
            //   )} is within the lower cutoff of ${lowerCutOff} day(s) from the current date.`,
            // );
          }
        }
      }
      const checkDates: { date: string; pickDrop: boolean }[] = [];

      for (const date of selectedDates) {
        if (loginTime) {
          checkDates.push({
            date: moment(date).format('YYYY-MM-DD'),
            pickDrop: true,
          });
        }

        if (logoutTime) {
          checkDates.push({
            date: moment(date).format('YYYY-MM-DD'),
            pickDrop: false,
          });
        }
      }
      if (!emergencyType) {
        const existingTrips = await this.tripRequestModel.findAll({
          where: {
            employeeID: employeeID,
            status: {
              [Op.in]: [Status.Approved, Status.Requested],
            },
            [Op.or]: checkDates.map(({ date, pickDrop }) => ({
              date,
              pickDrop,
            })),
          },
        });

        if (existingTrips.length > 0) {
          const existingDetails = existingTrips
            .map(
              (trip) =>
                `Date: ${moment(trip.date).format('DD/MM/yyyy')}, Shift Time: ${
                  trip.shiftTime
                }, EmployeeID: ${employeeID}`,
            )
            .join('; ');

          throw new BadRequestException(
            `Trip request already exists for the following dates and times: ${existingDetails}`,
          );
        }
      }

      if (emergencyType) {
        await this.tripRequestModel.update(
          { status: Status.Cancelled },
          {
            where: {
              date: moment(new Date()).format('YYYY-MM-DD'),
              pickDrop: false,
            },
            returning: true,
          },
        );
      }

      const tripRequests = selectedDates.flatMap((date) => {
        const tripRecords = [];
        const otp = generateOTP();
        if (loginTime) {
          tripRecords.push({
            ...createTripRequestInput,
            employeeID: employeeID,
            employeeCode: employee?.data?.employeeCode,
            orgID: organizationID,
            teamID: employee?.data?.teamID,
            processID: employee?.data?.processID,
            locationID: employee?.data?.locationID,
            locationName: employee?.data?.location?.name,
            date: moment(date).format('YYYY-MM-DD'),
            shiftTime: normalizeTime(loginTime),
            pickDrop: true,
            status: updatedStatus ?? Status.Active,
            attendanceOtp: otp,
          });
        }

        if (logoutTime) {
          let logoutDate = moment(date).format('YYYY-MM-DD');

          if (loginTime && logoutTime) {
            const loginHour = parseInt(loginTime.split(':')[0], 10);
            const [pickupHour, pickupMin] = loginTime.split(':').map(Number);
            const [dropoffHour, dropoffMin] = logoutTime.split(':').map(Number);

            const pickupMinutes = pickupHour * 60 + pickupMin;
            const dropoffMinutes = dropoffHour * 60 + dropoffMin;

            if (loginHour >= 19 || pickupMinutes > dropoffMinutes) {
              const nextDay = new Date(date);
              nextDay.setDate(nextDay.getDate() + 1);
              logoutDate = nextDay.toISOString().split('T')[0];
            }
          }

          const otp = generateOTP();
          tripRecords.push({
            ...createTripRequestInput,
            employeeID: employeeID,
            employeeCode: employee?.data?.employeeCode,
            orgID: organizationID,
            teamID: employee?.data?.teamID,
            processID: employee?.data?.processID,
            locationID: employee?.data?.locationID,
            locationName: employee?.data?.location?.name,
            date: logoutDate,
            shiftTime: normalizeTime(logoutTime),
            pickDrop: false,
            status: updatedStatus ?? Status.Active,
            emergencyType: emergencyType ?? null,
            attendanceOtp: otp,
          });
        }

        return tripRecords;
      });
      const trips = await this.tripRequestModel.bulkCreate(tripRequests);
      const eventPayload = JSON.parse(JSON.stringify(tripRequests));
      const eventLogs = trips.map((trip, index) => ({
        objectType: 'Trip Request',
        changeType: 'add',
        objectID: trip.id,
        authID: user.id,
        orgID: organizationID,
        updatedBy: user.name,
        payload: {
          date: trip.date,
          shiftTime: trip.shiftTime,
          employeeName: employee?.data?.name ?? null,
          employeeCode: employee?.data?.employeeCode ?? null,
        },
        requestPayload: eventPayload[index],
        user,
      }));

      await this.eventlogService.bulkCreate(eventLogs);
      return {
        message: `${trips.length} trip request(s) created successfully.`,
        data: trips[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        this.eventlogService.create({
          objectType: 'Trip Request',
          changeType: 'add-failed',
          objectID: null,
          authID: user?.id,
          orgID: createTripRequestInput.selectedOrgID ?? user?.orgID,
          updatedBy: user?.name,
          payload: {
            employeeID:
              createTripRequestInput.guestEmployeeID ?? user?.employeeID,
            employeeName: employee?.data?.name ?? null,
            employeeCode: employee?.data?.employeeCode ?? null,
            selectedDates: Array.isArray(createTripRequestInput.selectedDates)
              ? createTripRequestInput.selectedDates
                  .map((d) => {
                    const date = new Date(d);
                    if (isNaN(date.getTime())) return d;
                    const day = String(date.getUTCDate()).padStart(2, '0');
                    const month = String(date.getUTCMonth() + 1).padStart(
                      2,
                      '0',
                    );
                    const year = date.getUTCFullYear();
                    return `${day}/${month}/${year}`;
                  })
                  .join(', ')
              : createTripRequestInput.selectedDates,
            loginTime: createTripRequestInput.loginTime,
            logoutTime: createTripRequestInput.logoutTime,
          },
          requestPayload: createTripRequestInput,
          customDescription: `attempted to create Trip Request - ${error.message}`,
          user,
        });
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // Fix for cross-day validation bug in createBatchTripRequest method
  // REPLACE the existing createBatchTripRequest method with this corrected version:

  async createBatchTripRequest(
    createTripRequestInput: CreateTripRequestInput,
    user?: any,
  ): Promise<GenericResponse<TripRequest>> {
    try {
      const organizationID =
        createTripRequestInput.selectedOrgID ?? user?.orgID;
      const { selectedDates, loginTime, logoutTime, status, employeeCodes } =
        createTripRequestInput;
      const approvalType = await this.configService.getConfigValue(
        'AUTO_APPROVAL_TRIP_REQUEST',
        user?.orgID,
      );
      const updatedStatus = approvalType === 'Yes' ? Status.Approved : status;

      const employees = await this.employeeModel.findAll({
        where: {
          employeeCode: {
            [Op.in]: employeeCodes,
          },
          orgID: user?.orgID,
          status: Status.Active,
        },
        include: [
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
        ],
      });

      const validEmployeeCodes = new Set(
        employees.map((emp) => emp.employeeCode),
      );
      const invalidEmployeeCodes = employeeCodes.filter(
        (code) => !validEmployeeCodes.has(code),
      );

      if (invalidEmployeeCodes.length > 0) {
        const chunkSize = 5;
        const formattedList = invalidEmployeeCodes
          .reduce((acc, code, i) => {
            const chunkIndex = Math.floor(i / chunkSize);
            acc[chunkIndex] = acc[chunkIndex] || [];
            acc[chunkIndex].push(code);
            return acc;
          }, [] as string[][])
          .map((group) => group.join(', '))
          .join('\n');

        throw new BadRequestException(
          `Invalid Employee Codes found:\n${formattedList}`,
        );
      }
      //lower cutoff check- min time before we can add request
      // const lowerCutoffValue = await this.configService.getConfigValue(
      //   'LOWER_CUT_OFF',
      //   organizationID,
      // );
      // const lowerCutoff = parseInt(lowerCutoffValue, 10) || 0;
      // //upper cut off check max to which time req can be added.
      // const upperCutoffValue = await this.configService.getConfigValue(
      //   'UPPER_CUT_OFF',
      //   organizationID,
      // );
      // const upperCutoff = parseInt(upperCutoffValue, 10);
      const configResponse = await this.configService.getMultipleConfigValues(
        ['LOWER_CUT_OFF', 'UPPER_CUT_OFF'],
        { orgID: organizationID },
      );
      const {
        LOWER_CUT_OFF: lowerCutoffValue,
        UPPER_CUT_OFF: upperCutoffValue,
      } = configResponse?.data || {};
      const lowerCutoff = parseInt(lowerCutoffValue, 10) || 0;
      const upperCutoff = parseInt(upperCutoffValue, 10);

      const now = moment();
      const checkTime = (time: string, pickDrop: 'login' | 'logout') => {
        if (!time) return;

        // Build the selected datetime (today + chosen time)
        for (const date of selectedDates) {
          const selectedDate = moment(date).startOf('day');
          const selectedTime = moment(selectedDate).set({
            hour: parseInt(time.split(':')[0], 10),
            minute: parseInt(time.split(':')[1], 10),
            second: 0,
            millisecond: 0,
          });
          const diffInHours = selectedTime.diff(now, 'hours', true);

          // Lower cutoff violation
          if (lowerCutoff && diffInHours < lowerCutoff) {
            throw new BadRequestException(
              `Trip request cannot be created. The selected ${pickDrop} time ${selectedTime.format(
                'DD/MM/YYYY HH:mm',
              )} is within the lower cutoff of ${lowerCutoff} hour(s).`,
            );
          }
          if (upperCutoff && diffInHours > upperCutoff) {
            throw new BadRequestException(
              `Trip request cannot be created. The selected ${pickDrop} time ${selectedTime.format(
                'DD/MM/YYYY HH:mm',
              )} exceeds the upper cutoff of ${upperCutoff} hour(s).`,
            );
          }
        }
      };
      checkTime(loginTime, 'login');
      checkTime(logoutTime, 'logout');
      const checkDates: { date: string; pickDrop: boolean }[] = [];

      for (const date of selectedDates) {
        // Add pickup validation
        if (loginTime) {
          checkDates.push({
            date: moment(date).format('YYYY-MM-DD'),
            pickDrop: true,
          });
        }

        // Add dropoff validation with cross-day logic
        if (logoutTime) {
          let logoutDate = moment(date).format('YYYY-MM-DD');

          // Apply the same cross-day logic here as in trip creation
          if (loginTime && logoutTime) {
            const loginHour = parseInt(loginTime.split(':')[0], 10);
            const [pickupHour, pickupMin] = loginTime.split(':').map(Number);
            const [dropoffHour, dropoffMin] = logoutTime.split(':').map(Number);

            const pickupMinutes = pickupHour * 60 + pickupMin;
            const dropoffMinutes = dropoffHour * 60 + dropoffMin;

            // Same logic: pickup >= 7 PM OR pickup time > dropoff time means next day dropoff
            if (loginHour >= 19 || pickupMinutes > dropoffMinutes) {
              const nextDay = new Date(date);
              nextDay.setDate(nextDay.getDate() + 1);
              logoutDate = nextDay.toISOString().split('T')[0];
            }
          }

          checkDates.push({
            date: logoutDate, // Use calculated date, not original date
            pickDrop: false,
          });
        }
      }

      // Check for existing trips with correct dates
      const existingTrips = await this.tripRequestModel.findAll({
        where: {
          employeeCode: {
            [Op.in]: employeeCodes,
          },
          orgID: user?.orgID,
          status: {
            [Op.in]: [Status.Approved, Status.Requested],
          },
          [Op.or]: checkDates.map(({ date, pickDrop }) => ({
            date,
            pickDrop,
          })),
        },
      });

      if (existingTrips.length > 0) {
        const existingDetails = existingTrips
          .map(
            (trip) =>
              `Date: ${moment(trip.date).format('DD/MM/yyyy')}, Shift Time: ${
                trip.shiftTime
              }, Employee Code: ${trip.employeeCode}`,
          )
          .join('; ');

        throw new BadRequestException(
          `Trip request already exists for the following dates and times: ${existingDetails}`,
        );
      }

      // Rest of the trip creation logic remains the same...
      const tripRequests = employees.flatMap((employee) =>
        selectedDates.flatMap((date) => {
          const tripRecords = [];
          const otp = generateOTP();

          if (loginTime) {
            tripRecords.push({
              ...createTripRequestInput,
              employeeID: employee.id,
              employeeCode: employee.employeeCode,
              orgID: employee.orgID,
              teamID: employee.teamID,
              processID: employee.processID,
              locationID: employee.locationID,
              locationName: employee.location?.name,
              geoCode: employee.homePoint,
              date: moment(date).format('YYYY-MM-DD'),
              shiftTime: normalizeTime(loginTime),
              pickDrop: true,
              status: updatedStatus ?? Status.Active,
              attendanceOtp: otp,
              emergencyType: null,
            });
          }

          if (logoutTime) {
            let logoutDate = moment(date).format('YYYY-MM-DD');

            // Check for next day dropoff: existing business rule OR cross-day scenario
            if (loginTime && logoutTime) {
              const loginHour = parseInt(loginTime.split(':')[0], 10);
              const [pickupHour, pickupMin] = loginTime.split(':').map(Number);
              const [dropoffHour, dropoffMin] = logoutTime
                .split(':')
                .map(Number);

              const pickupMinutes = pickupHour * 60 + pickupMin;
              const dropoffMinutes = dropoffHour * 60 + dropoffMin;

              // Existing business rule: pickup >= 7 PM OR new logic: pickup time > dropoff time
              if (loginHour >= 19 || pickupMinutes > dropoffMinutes) {
                const nextDay = new Date(date);
                nextDay.setDate(nextDay.getDate() + 1);
                logoutDate = nextDay.toISOString().split('T')[0];
              }
            }

            const otp = generateOTP();
            tripRecords.push({
              ...createTripRequestInput,
              employeeID: employee?.id,
              employeeCode: employee?.employeeCode,
              orgID: employee?.orgID,
              teamID: employee?.teamID,
              processID: employee?.processID,
              locationID: employee?.locationID,
              locationName: employee?.location?.name,
              date: logoutDate,
              shiftTime: normalizeTime(logoutTime),
              pickDrop: false,
              geoCode: employee.homePoint,
              status: updatedStatus ?? Status.Active,
              emergencyType: null,
              attendanceOtp: otp,
            });
          }

          return tripRecords;
        }),
      );

      const trips = await this.tripRequestModel.bulkCreate(tripRequests);

      const employeeCodesJoined = employees
        .map((emp) => emp.employeeCode)
        .join(', ');

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

      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      trips.forEach((trip) => {
        changeJSON[`Trip Request ${trip.id} (${trip.employeeCode})`] = {
          OldValue: 'N/A',
          newValue: `${formatDateOnly(trip.date)} - ${trip.shiftTime} - ${
            trip.pickDrop ? 'Pick' : 'Drop'
          }`,
        };
      });

      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'add',
        objectID: trips.length === 1 ? trips[0].id : null,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: {
          employeeCodes: employeeCodesJoined,
        },
        requestPayload: JSON.parse(JSON.stringify(tripRequests)),
        changeJSON,
        customDescription: 'created Batch Trip Requests',
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: `${trips.length} trip request(s) created successfully.`,
        data: trips[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        // Formats a date as DD/MM/YYYY, date-only.
        const formatDateOnly = (value: any): string => {
          if (!value) return String(value ?? '');
          const d = new Date(value);
          if (isNaN(d.getTime())) return String(value);
          const day = String(d.getUTCDate()).padStart(2, '0');
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const year = d.getUTCFullYear();
          return `${day}/${month}/${year}`;
        };
        this.eventlogService.create({
          objectType: 'Trip Request',
          changeType: 'add-failed',
          objectID: null,
          authID: user?.id,
          orgID: createTripRequestInput.selectedOrgID ?? user?.orgID,
          updatedBy: user?.name,
          payload: {
            employeeCodes: Array.isArray(createTripRequestInput.employeeCodes)
              ? createTripRequestInput.employeeCodes.join(', ')
              : createTripRequestInput.employeeCodes,
            selectedDates: Array.isArray(createTripRequestInput.selectedDates)
              ? createTripRequestInput.selectedDates
                  .map(formatDateOnly)
                  .join(', ')
              : createTripRequestInput.selectedDates,
            loginTime: createTripRequestInput.loginTime,
            logoutTime: createTripRequestInput.logoutTime,
          },
          requestPayload: createTripRequestInput,
          customDescription: `attempted to create Trip Request - ${error.message}`,
          user,
        });
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // Add this method to TripRequestService class

  async markAttendance(
    markAttendanceInput: MarkAttendanceInput,
    user: any,
  ): Promise<GenericResponse<TripRequest>> {
    // Hoisted above try so the catch block's failure log can include the
    // employee's name/code whenever the lookup succeeded before whatever
    // validation later failed.
    let employee: any;
    try {
      const { tripRequestID, employeeID, attendanceLocation } =
        markAttendanceInput;
      employee = await this.employeeService.findOne(BigInt(employeeID));
      const orgID = employee?.data?.orgID;
      // Fetch org admin
      // const orgAdmin = await this.employeeModel.findOne({
      //   where: {
      //     orgID: orgID,
      //     employeeType: 'Admin',
      //   },
      //   attributes: ['name', 'email', 'phone'],
      //   include: [
      //     {
      //       model: EmployeeDeviceInfo,
      //       attributes: ['deviceToken', 'createdAt'],
      //     },
      //     {
      //       model: Authentication,
      //       as: 'authInput',
      //       attributes: ['id'],
      //     },
      //   ],
      // });
      // Find the trip request
      const tripRequest = await this.tripRequestModel.findOne({
        where: {
          id: tripRequestID,
          employeeID: employeeID,
          orgID: orgID,
        },
      });

      if (!tripRequest) {
        throw new NotFoundException('Trip request not found');
      }

      if (tripRequest.tripID) {
        const trip = await this.tripService.findOne(Number(tripRequest.tripID));

        if (trip.status !== 'Ongoing') {
          throw new BadRequestException(
            `Attendance can only be marked when trip is Ongoing. Current status: ${trip.status}`,
          );
        }
      }

      // Check if attendance is already marked
      if (tripRequest.attendance === true) {
        throw new BadRequestException(
          'Attendance already marked for this employee',
        );
      }

      // Update trip request with attendance details
      const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');
      const markedTime = moment().format('DD-MMM-YYYY hh:mm');

      const [affectedCount] = await this.tripRequestModel.update(
        {
          attendanceMode: 'Manual',
          attendance: true,
          attendanceTime: currentDateTime,
          noShow: false,
          attendanceLocation: attendanceLocation,
        },
        {
          where: {
            id: tripRequestID,
            employeeID: employeeID,
          },
          returning: true,
        },
      );

      if (affectedCount === 0) {
        throw new BadRequestException('Failed to mark attendance');
      }

      // Get updated trip request
      const updatedTripRequest = await this.tripRequestModel.findByPk(
        tripRequestID,
      );

      // *** NEW: Update Trip model's employees array ***
      if (tripRequest.tripID) {
        // Find the trip that contains this employee - convert bigint to string
        const trip = await this.tripService.findOne(Number(tripRequest.tripID));

        if (trip && trip.employees) {
          // Update the specific employee in the employees array
          const updatedEmployees = trip.employees.map((emp) => {
            if (emp.id === employeeID) {
              return {
                ...emp,
                attendance: true,
                attendanceTime: currentDateTime,
                attendanceMode: 'Manual',
                noShow: false,
                attendanceLocation: attendanceLocation,
              };
            }
            return emp;
          });

          // Update the Trip model with the updated employees array - convert bigint to string
          await this.tripService.updateEmployeesArray(
            tripRequest.tripID.toString(),
            updatedEmployees,
          );
        }
      }

      // Formats a date/time as DD/MM/YYYY HH:mm:ss. Uses LOCAL getters
      // (not UTC) since currentDateTime is built via moment().format(),
      // a plain local-time string with no timezone marker — reading it
      // back with getUTC* methods was subtracting the server's UTC
      // offset a second time, shifting the displayed time backward by
      // that same offset (e.g. IST: displayed ~5.5 hours earlier than
      // the actual attendance time).
      const formatDateTime = (value: any): string => {
        if (!value) return 'N/A';
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
      };

      // Create event log
      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripRequestID,
        authID: user.id,
        updatedBy: user.name,
        payload: {
          tripRequestID: updatedTripRequest?.id,
          tripID: updatedTripRequest?.tripID,
          employeeCode: updatedTripRequest?.employeeCode,
          attendanceMode: updatedTripRequest?.attendanceMode,
          attendanceTime: formatDateTime(updatedTripRequest?.attendanceTime),
        },
        requestPayload: markAttendanceInput,
        customDescription: 'marked attendance manually',
        user,
      };

      const eventCreated = await this.eventlogService.create(eventLog);
      // Send push notification to org admin
      // if (orgAdmin) {
      //   const deviceInfoList = orgAdmin.get('employeeDeviceInfo') ?? [];
      //   const deviceInfo = deviceInfoList?.sort(
      //     (a: any, b: any) =>
      //       new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      //   )?.[0];

      //   if (deviceInfo?.deviceToken) {
      //     const payload = {
      //       organizationId: String(orgID),
      //       event: 'emp.mark.attendance',
      //       locale: 'en',
      //       queue: true,
      //       recipient: {
      //         id: String(orgAdmin.authInput?.id),
      //         email: orgAdmin.email,
      //         firstName: orgAdmin.name,
      //         phoneNumber: orgAdmin.phone,
      //         deviceToken: deviceInfo.deviceToken,
      //       },
      //       channels: [NotificationChannel.PUSH],
      //       data: {
      //         trip: tripRequest.tripID,
      //         employeeName: employee?.data?.name,
      //         markedTime: currentDateTime,
      //       },
      //       eventLogId: String(eventCreated?.id),
      //     };
      //     await this.notificationDispatcher.notify(payload);
      //   }
      // }
      const employeePhone = employee?.data?.phone;
      if (employeePhone) {
        const payload = {
          organizationId: String(orgID),
          event: 'emp.mark.attendance',
          locale: 'en',
          queue: false,
          recipient: {
            id: String(employeeID),
            email: employee?.data?.email,
            firstName: employee?.data?.name,
            phoneNumber: employeePhone,
          },
          channels: [NotificationChannel.SMS],
          data: {
            firstName: employee?.data?.name,
            markedTime: markedTime,
            tripID: tripRequest.tripID,
          },
          eventLogId: String(eventCreated?.id),
          tripID: String(tripRequest.tripID),
          empID: String(employeeID),
        };
        await this.notificationDispatcher.notify(payload);
      }

      return {
        message: 'Attendance marked successfully',
        data: updatedTripRequest,
      };
    } catch (error) {
      // this.logger.error('Error marking attendance:', error);

      if (error.status !== 500) {
        this.eventlogService.create({
          objectType: 'Trip Request',
          changeType: 'edit-failed',
          objectID: markAttendanceInput?.tripRequestID,
          authID: user?.id,
          orgID: employee?.data?.orgID,
          updatedBy: user?.name,
          payload: {
            tripRequestID: markAttendanceInput?.tripRequestID,
            employeeID: markAttendanceInput?.employeeID,
            employeeName: employee?.data?.name ?? null,
            employeeCode: employee?.data?.employeeCode ?? null,
            attendanceLocation: markAttendanceInput?.attendanceLocation,
          },
          requestPayload: markAttendanceInput,
          customDescription: `attempted to mark attendance - ${error.message}`,
          user,
        });
        throw error;
      }
      throw new InternalServerErrorException('Failed to mark attendance');
    }
  }

  async findAll(
    tripRequestFilterInput: TripRequestFilterInput,
    user?: any,
  ): Promise<PaginatedList<TripRequest>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        filter,
        reportingID,
      } = tripRequestFilterInput;
      let whereCondition: any;
      if (!whereCondition) {
        whereCondition = {};
      }
      if (reportingID) {
        const employee = await this.employeeModel.findAll({
          where: { reportingID },
        });
        const employeeIds = employee.map((emp) => emp.id);
        if (employeeIds.length > 0) {
          whereCondition.employeeID = { [Op.in]: employeeIds };
        } else {
          whereCondition.employeeID = { [Op.in]: [null] };
        }
      } else {
        if (user?.userType !== UserType.SuperAdmin) {
          if (user?.employeeID !== null) {
            const employee = await this.employeeService.findOne(
              user?.employeeID,
            );

            if (employee?.data?.employeeType === EmployeeType.Employee) {
              if (user?.employeeID !== null)
                whereCondition.employeeID = user?.employeeID;
              whereCondition.orgID = user?.orgID;
            }
            if (employee?.data?.employeeType === EmployeeType.Admin) {
              whereCondition.orgID = user?.orgID;
            }
          } else {
            whereCondition.orgID = user?.orgID;
          }
        }
      }
      if (filter) {
        const filterConditions = this.buildFilterCondition(JSON.parse(filter));
        whereCondition = { ...whereCondition, [Op.and]: filterConditions };
      }

      const trips = await this.tripRequestModel.findAndCountAll({
        where: whereCondition,
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'pickUpTime',
          'dropTime',
          'status',
          'emergencyType',
          'officeLocation',
        ],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['name', 'email', 'phone', 'designation'],
          },
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
        ],
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

  /**
   * Export twin of findAll for the trip-request ops page (tripRequestList).
   *
   * attributes/include are identical to findAll and the filter runs through the
   * same buildFilterCondition DSL interpreter, so the two agree on columns and
   * on how a filter is interpreted. They are NOT guaranteed to return the same
   * rows, and callers should not assume so: scoping is deliberately tighter
   * here for four EmployeeType values (see the block below).
   *
   * dateRange is OPTIONAL. Send both bounds or neither; one of the two is a
   * 400. Nothing is defaulted when it is omitted — no current month, no today
   * — so with no range and no date-bearing filter item, EXPORT_ROW_CAP is the
   * ONLY bound on the result set, and an unfiltered call is an all-time,
   * org-wide export of employee contact data up to that cap.
   *
   * Two caller shapes, and they must not be mixed:
   *  - dialog-less (the shape this method was relaxed for): send the ops page's
   *    applied filter DSL as-is and omit dateRange. The DSL's own date item
   *    (`currentToFuture` by default, `eq` once the operator picks a date) is
   *    then the date predicate.
   *  - with dateRange: the caller MUST strip the grid's `date` item out of
   *    `filter` first. Both land under Op.and and AND with each other, so a
   *    past dateRange plus the default currentToFuture item is unsatisfiable
   *    and yields an empty sheet with a 200, not an error. This is what the
   *    pre-dialog-removal FE does (tripRequestList strips the date item and
   *    marks dateRange required), and it stays supported.
   *
   * Otherwise it differs from findAll in exactly four ways, marked inline.
   */
  async exportTripRequests(
    exportFilters: any,
    user?: any,
  ): Promise<PaginatedList<TripRequest>> {
    try {
      const { dateRange, filter } = exportFilters || {};
      const startDate = dateRange?.startDate;
      const endDate = dateRange?.endDate;

      // Difference 1: the date range is optional, but it is all-or-nothing.
      // Omit both and the export contributes NO date predicate at all — unlike
      // the report-export service it must NOT fall back to the current month,
      // to today, or to anything else, because a silent default would export
      // rows the operator never asked for. With no range, EXPORT_ROW_CAP below
      // is the only bound on the result set. Half a range is an error: it is
      // far more likely a caller bug than a deliberate open-ended bound.
      if (Boolean(startDate) !== Boolean(endDate)) {
        throw new BadRequestException(
          'dateRange.startDate and dateRange.endDate must be supplied together, or both omitted',
        );
      }
      const hasDateRange = Boolean(startDate) && Boolean(endDate);

      // The body is an inline type, so the global ValidationPipe skips it and
      // these two values reach Op.between unchecked. Enforce the format here:
      // date is a varchar column (see the predicate below), so Op.between is a
      // lexicographic string compare and a value carrying a time component
      // (e.g. '2026-08-01T18:30:00.000Z', what toISOString() gives for IST
      // midnight) does not compare as a date at the bounds — it sorts after
      // every clean '2026-08-01' row and would silently drop a day rather than
      // fail. Anything non-date-shaped would reach Postgres unvalidated.
      const isDateOnly = (value: any) =>
        typeof value === 'string' &&
        moment(value, 'YYYY-MM-DD', true).isValid();
      if (hasDateRange && (!isDateOnly(startDate) || !isDateOnly(endDate))) {
        throw new BadRequestException(
          'dateRange.startDate and dateRange.endDate must be YYYY-MM-DD dates without a time component',
        );
      }

      let whereCondition: any = {};

      // Scoping block. Adapted from findAll rather than copied: findAll tests
      // only EmployeeType.Employee and EmployeeType.Admin with no else, so the
      // other four EmployeeType values (Transport Team, Security Manager,
      // Guest Employee, '') fall through with NO orgID and NO employeeID. That
      // is reachable — auth.service.ts:557-568 lets Transport Team log in via
      // the Admin endpoint — and would export employee PII across every org.
      // orgID is therefore unconditional here, with employeeID kept as an extra
      // narrowing on top. This scopes tighter than the grid for those four
      // types, never looser. reportingID is not part of the export contract, so
      // findAll's reportingID branch (which applies no orgID at all) is omitted.
      if (user?.userType !== UserType.SuperAdmin) {
        whereCondition.orgID = user?.orgID;

        if (user?.employeeID !== null) {
          const employee = await this.employeeService.findOne(user?.employeeID);

          if (employee?.data?.employeeType === EmployeeType.Employee) {
            whereCondition.employeeID = user?.employeeID;
          }
        }
      }

      // Only bound the query when a range was actually supplied. Omitted ->
      // no date key on whereCondition at all, leaving the caller's filter DSL
      // as the sole source of any date predicate.
      //
      // "TripRequests"."date" is a character varying column, NOT a timestamp:
      // the migration declares Sequelize.DATE but the live column is varchar,
      // matching the model's `date: string`. So this Op.between is a STRING
      // comparison, not a date comparison. It is inclusive at both ends and
      // agrees with a calendar range only because rows are written in
      // zero-padded 'YYYY-MM-DD', which sorts lexicographically the same way
      // it sorts chronologically. The isDateOnly guard above is what keeps the
      // bounds in that same shape.
      if (hasDateRange) {
        whereCondition.date = { [Op.between]: [startDate, endDate] };
      }

      if (filter) {
        let parsedFilter: any;
        try {
          parsedFilter =
            typeof filter === 'string' ? JSON.parse(filter) : filter;
        } catch {
          throw new BadRequestException(
            'exportFilters.filter is not valid JSON',
          );
        }
        const filterConditions = this.buildFilterCondition(parsedFilter);
        whereCondition = { ...whereCondition, [Op.and]: filterConditions };
      }

      // Difference 2: count first, so an oversized export is refused before the
      // rows are materialised. The includes have to be present with
      // attributes: [] — buildFilterCondition rewrites a dotted column into
      // $employee.name$ / $location.name$, which Postgres rejects with a
      // missing FROM-clause entry unless the join is in the query. The ops
      // page's search box sends employee.name, so this is a live path.
      const totalItems = await this.tripRequestModel.count({
        where: whereCondition,
        include: [
          { model: Employee, as: 'employee', attributes: [] },
          { model: Location, as: 'location', attributes: [] },
        ],
        distinct: true,
        col: 'id',
      });

      if (totalItems > EXPORT_ROW_CAP) {
        throw new BadRequestException(
          `Export matched ${totalItems} trip requests, which exceeds the export limit of ${EXPORT_ROW_CAP}. Add or tighten a filter on the list — a date, status, or shift — and try again.`,
        );
      }

      // Difference 3: no pagination — no offset, and no caller-supplied take.
      // The limit here is not paging, it is a clamp: the count above and this
      // query are two unsynchronised statements, so without it a concurrent
      // insert could push the response past the cap and over the payload
      // ceiling. attributes and include are identical to findAll, not widened.
      // Order matches findAll's defaults (id DESC).
      const tripRequests = await this.tripRequestModel.findAll({
        where: whereCondition,
        order: [['id', SortOrder.DESC]],
        limit: EXPORT_ROW_CAP,
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'pickUpTime',
          'dropTime',
          'status',
          'emergencyType',
          'officeLocation',
        ],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['name', 'email', 'phone', 'designation'],
          },
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
        ],
      });

      // Difference 4: deliberately NOT formatTripDates, which writes DD/MM/YYYY.
      // date is a varchar already holding 'YYYY-MM-DD' for effectively every
      // row, so this is a re-parse and re-print of a string, not a date
      // conversion, and it is a no-op for the clean rows that make up the table.
      // moment.utc rather than moment so a row that does carry a time component
      // ('...T18:30:00.000Z') cannot have its calendar date shifted by the host
      // timezone. It does NOT rescue a row stored in some other shape: an
      // unparseable value formats to the literal 'Invalid date', and a
      // 'DD/MM/YYYY' value is silently reinterpreted as MM/DD (verified:
      // '01/08/2026' -> '2026-01-08'). Kept as-is because the clean-row path is
      // what runs; tighten it only alongside a data fix.
      const items = tripRequests.map((trip) => {
        trip.setDataValue(
          'date',
          trip.date ? moment.utc(trip.date).format('YYYY-MM-DD') : null,
        );
        return trip;
      });

      return {
        totalItems,
        items,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllTripRequestsByShiftTime(
    user?: any,
    shiftDate?: string,
    shiftTime?: string,
    pickDrop?: boolean,
    requestType?: string,
    employeeID?: any,
  ) {
    try {
      const normalizedShiftTime = normalizeTime(shiftTime);
      const whereCondition: any = {};
      if (employeeID) {
        whereCondition.employeeID = employeeID;
      }
      whereCondition.shiftTime = normalizedShiftTime;
      whereCondition.date = shiftDate;
      // whereCondition.date = {
      //   [Op.between]: [
      //     new Date(`${shiftDate}T00:00:00.000Z`),
      //     new Date(`${shiftDate}T23:59:59.999Z`),
      //   ],
      // };
      whereCondition.pickDrop = pickDrop;
      whereCondition.orgID = user?.orgID;
      whereCondition.status = Status.Approved;
      whereCondition.tripID = null;
      //   whereCondition.emergencyType = requestType;
      if (requestType != 'null') {
        whereCondition.emergencyType = requestType;
      } else {
        whereCondition.emergencyType = null;
      }

      const trips = await this.tripRequestModel.findAndCountAll({
        where: whereCondition,
        // order: [[sortBy, sortOrder]],
        // limit: take,
        // offset: skip * take,
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'pickUpTime',
          'dropTime',
          'status',
          'locationID',
          'noShow',
          'officeLocation',
        ],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: [
              'id',
              'name',
              'gender',
              'phone',
              'homePoint',
              'landmark',
              'address',
              'locationID',
              'sortOrder',
              'commuteDistance',
              'commuteTime',
              'specialConsideration',
            ],
            include: [
              {
                model: Location,
                as: 'location',
                attributes: ['id', 'name'],
              },
            ],
          },
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
        ],
      });
      if (trips) {
        const formattedData = trips?.rows?.map((trip) => ({
          tripRequestID: trip?.id,
          tripID: trip?.tripID,
          id: trip?.employee?.id,
          empCode: trip?.employeeCode,
          name: trip?.employee?.name,
          gender: trip?.employee?.gender?.toLowerCase(),
          location: trip?.location?.name,
          address: trip?.employee?.address,
          landmark: trip?.employee?.landmark,
          employee: trip?.employee,
          locationID: trip?.employee?.locationID,
          pickUpTime: trip?.pickUpTime,
          noShow: trip?.noShow,
          specialConsideration: trip?.employee?.specialConsideration,
          officeLocation: trip?.officeLocation,
        }));
        return {
          totalItems: trips.count,
          items: formattedData,
        };
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // Replace your findAllShiftTimeByTrips method with this (minimal change):

  //   async findAllShiftTimeByTrips(user?: any, date?: string) {
  //     try {
  //       const shiftTimes = await TripRequest.findAll({
  //         attributes: [
  //           [col('TripRequest.shiftTime'), 'shiftTime'],
  //           [fn('COUNT', col('TripRequest.id')), 'requestCount'],
  //           [col('TripRequest.pickDrop'), 'pickDrop'],

  //         ],
  //         include: [
  //           {
  //             model: Trip,
  //             as: 'trip',
  //             attributes: [],
  //             required: false, // LEFT JOIN
  //           },
  //         ],
  //         where: {
  //           orgID: user.orgID,
  //           status: Status.Approved,
  //           deletedAt: null,
  //           // [Op.and]: [
  //           //   where(
  //           //     fn(
  //           //       'DATE',
  //           //       literal(`"TripRequest"."date" AT TIME ZONE 'Asia/Kolkata'`),
  //           //     ),
  //           //     '=',
  //           //     date,
  //           //   ),
  //           // ],
  //           [Op.and]: [
  //             where(
  //               fn(
  //                 'DATE',
  //                 literal(
  //                   `timezone('Asia/Kolkata', "TripRequest"."date"::timestamp)`,
  //                 ),
  //               ),
  //               '=',
  //               date,
  //             ),
  //           ],
  //         },
  //         group: ['TripRequest.shiftTime', 'TripRequest.pickDrop'],
  //         raw: true,
  //       });
  //       console.log("shiftTimes-----",shiftTimes);
  //       return shiftTimes;
  //     } catch (error) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //       throw new InternalServerErrorException(error);
  //     }
  //   }

  async findAllShiftTimeByTrips(user?: any, date?: string) {
    try {
      // Calculate start and end of the date in IST
      const startOfDayIST = DateTime.fromISO(date, { zone: 'Asia/Kolkata' })
        .startOf('day')
        .toUTC()
        .toISO();
      const endOfDayIST = DateTime.fromISO(date, { zone: 'Asia/Kolkata' })
        .endOf('day')
        .toUTC()
        .toISO();

      const shiftTimes = await TripRequest.findAll({
        attributes: [
          [col('TripRequest.shiftTime'), 'shiftTime'],
          [fn('COUNT', col('TripRequest.id')), 'requestCount'],
          [col('TripRequest.pickDrop'), 'pickDrop'],
          [col('TripRequest.emergencyType'), 'emergencyType'],
          [fn('COUNT', fn('DISTINCT', col('TripRequest.tripID'))), 'tripCount'],
          //   [fn('COUNT', col('TripRequest.tripID')), 'tripCount'],
        ],
        include: [
          {
            model: Trip,
            as: 'trip',
            attributes: [],
            required: false,
          },
        ],
        where: {
          orgID: user.orgID,
          status: { [Op.in]: [Status.Approved, Status.EmployeeSelfNoShow] },
          deletedAt: null,
          date: {
            [Op.between]: [startOfDayIST, endOfDayIST],
          },
        },
        group: [
          'TripRequest.shiftTime',
          'TripRequest.pickDrop',
          'TripRequest.emergencyType',
        ],
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

  async findAllVendorShiftTimeByTrips(
    user?: any,
    date?: string,
    orgID?: string,
  ) {
    try {
      // Calculate start and end of the date in IST
      const startOfDayIST = DateTime.fromISO(date, { zone: 'Asia/Kolkata' })
        .startOf('day')
        .toUTC()
        .toISO();
      const endOfDayIST = DateTime.fromISO(date, { zone: 'Asia/Kolkata' })
        .endOf('day')
        .toUTC()
        .toISO();

      const whereCondition: any = {
        vendorID: user.vendorID,
        date: {
          [Op.between]: [startOfDayIST, endOfDayIST],
        },
      };

      if (orgID) {
        whereCondition.orgID = orgID;
      }

      const shiftTimes = await this.tripModel.findAll({
        attributes: [
          [col('Trip.shiftTime'), 'shiftTime'],
          [fn('COUNT', col('Trip.id')), 'requestCount'],
          [col('Trip.pickDrop'), 'pickDrop'],
          // [col('TripRequest.emergencyType'), 'emergencyType'],
          // [fn('COUNT', fn('DISTINCT', col('TripRequest.tripID'))), 'tripCount'],
          // [fn('COUNT', col('TripRequest.tripID')), 'tripCount'],
        ],
        // where: {
        //   vendorID: user.vendorID,
        //   // deletedAt: null,
        //   date: {
        //     [Op.between]: [startOfDayIST, endOfDayIST],
        //   },
        //   orgID,
        // },
        where: whereCondition,
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

  async findAllTripRequestsForEdit(
    user?: any,
    shiftDate?: string,
    shiftTime?: string,
    pickDrop?: boolean,
    employeeID?: any,
  ) {
    try {
      const whereCondition: any = {};
      if (employeeID) {
        whereCondition.employeeID = employeeID;
      }
      whereCondition.shiftTime = shiftTime;
      whereCondition.date = shiftDate;
      whereCondition.pickDrop = pickDrop;
      whereCondition.orgID = user?.orgID;
      whereCondition.status = Status.Approved;
      const trips = await this.tripRequestModel.findAndCountAll({
        where: whereCondition,
        // order: [[sortBy, sortOrder]],
        // limit: take,
        // offset: skip * take,
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'pickUpTime',
          'dropTime',
          'status',
          'tripID',
          'noShow',
          'attendance',
          'deboard',
        ],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: [
              'id',
              'name',
              'gender',
              'phone',
              'homePoint',
              'landmark',
              'address',
              'locationID',
            ],
          },
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'id',
              'routeNumber',
              'seats',
              'spock',
              'estimatedOccupancy',
              'tripLocation',
            ],
          },
        ],
      });

      const formattedData = trips.rows.map((trip) => ({
        tripRequestID: trip?.id,
        noShow: trip?.noShow,
        deboard: trip?.deboard,
        attendance: trip?.attendance,
        id: trip?.employee?.id,
        name: trip?.employee?.name,
        gender: trip?.employee?.gender.toLowerCase(),
        location: trip?.location?.name,
        address: trip?.employee?.address,
        landmark: trip?.employee?.landmark,
        trip: {
          id: trip?.trip?.id,
          routeNumber: trip?.trip?.routeNumber,
          seats: trip?.trip?.seats,
          spock: trip?.trip?.spock,
          estimatedOccupancy: trip?.trip?.estimatedOccupancy,
          tripLocation: trip?.trip?.tripLocation,
        },
      }));

      return {
        totalItems: trips.count,
        items: formattedData,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  //   async findAllTripRequestsByIds(ids: string[] | string | undefined) {
  //     try {
  //       const requestsById = await this.tripRequestModel.findAndCountAll({
  //         where: { id: { [Op.in]: ids } },
  //         attributes: ['id', 'employeeID', 'noShow'],
  //       });
  //       return {
  //         totalItems: requestsById.count,
  //         items: requestsById?.rows,
  //       };
  //     } catch (error) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //       throw new InternalServerErrorException(error);
  //     }
  //   }

  async findAllTripRequestsByTripID(tripID: any) {
    try {
      const trips = await this.tripRequestModel.findAndCountAll({
        where: { tripID: tripID },
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
        ],
      });
      return {
        totalItems: trips.count,
        items: trips?.rows,
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
          case 'currentToFuture':
            condition = {
              [columnPath]: {
                [Op.gte]: moment(new Date()).format('yyyy-MM-DD'),
              },
            };
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

  private buildWhereCondition(tripType: string, currentDate: Date): any {
    const conditions: Record<string, any> = {};

    switch (tripType) {
      case 'ongoing':
        conditions.date = { [Op.gte]: currentDate };
        conditions.status = Status.Requested;
        break;
      case 'previous':
        conditions.date = { [Op.lt]: currentDate };
        break;
      case 'rejected':
        conditions.status = Status.Rejected;
        break;
      case 'approved':
        conditions.status = Status.Approved;
        break;
      case 'requested':
        conditions.status = Status.Requested;
        break;
      case 'cancelled':
        conditions.status = Status.Cancelled;
        break;
      default:
        break;
    }

    return conditions;
  }

  private formatTripDates(trips: TripRequest[]): TripRequest[] {
    return trips.map((trip) => {
      trip.setDataValue('date', moment(trip.date).format('DD/MM/YYYY') ?? null);
      return trip;
    });
  }

  async findOne(id: string, user?: any): Promise<GenericResponse<TripRequest>> {
    try {
      const employee = await this.employeeModel.findOne({
        where: {
          id: user?.employeeID,
        },
      });
      const trip = await this.tripRequestModel.findOne({
        where: { id },
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: [
              'name',
              'email',
              'phone',
              'designation',
              'reportingID',
            ],
          },
        ],
      });
      if (!trip) {
        throw new NotFoundException('Invalid trip request ID');
      }
      if (trip.orgID == user.orgID) {
        return { message: 'Trip request found', data: trip };
      }

      // Check if the user is a lead and the trip belongs to their employee
      if (trip.employee.reportingID === employee.id) {
        return { message: 'Trip request found', data: trip };
      }

      // Optional: Allow admins to access any trip
      if (employee.employeeType === EmployeeType.Admin) {
        return { message: 'Trip request found', data: trip };
      }

      // If none of the above conditions are met, deny access
      throw new ForbiddenException(
        'You are not authorized to view this trip request',
      );
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // Maps emergencyType -> the objectType used for event logging, so each
  // emergency trip-request flavor gets its own distinct module/description
  // in the event log (e.g. "updated 2 fields in Medical Trip Request")
  // instead of being lumped under the generic "Trip Request" label.
  // Keyed off the EmergencyType enum (not raw strings) so this can't
  // silently drift out of sync if a new emergency type is ever added.
  // Anything not in this map (undefined, or a value outside the enum)
  // falls back to plain 'Trip Request'.
  private static readonly EMERGENCY_OBJECT_TYPE_MAP: Record<
    EmergencyType,
    string
  > = {
    [EmergencyType.AdHoc]: 'Adhoc Trip Request',
    [EmergencyType.Medical]: 'Medical Trip Request',
    [EmergencyType.Emergency]: 'Emergency Trip Request',
  };

  private resolveTripRequestObjectType(
    emergencyType?: EmergencyType | string,
  ): string {
    return (
      TripRequestService.EMERGENCY_OBJECT_TYPE_MAP[
        emergencyType as EmergencyType
      ] ?? 'Trip Request'
    );
  }

  async update(
    id: string,
    updateTripRequestInput: UpdateTripRequestInput,
    user: any,
  ): Promise<any> {
    // Hoisted above try so the catch block can log identifying info even
    // if the failure happens before these are normally assigned (e.g.
    // findOne itself throwing, or employee lookup failing).
    let existingRequest: any;
    let employee: any;
    try {
      const requestById = await this.findOne(id, user);
      existingRequest = requestById.data; // the actual TripRequest record

      employee = await this.employeeService.findOne(existingRequest.employeeID);
      if (!employee) {
        throw new BadRequestException('Employee not found.');
      }
      const configResponse = await this.configService.getMultipleConfigValues(
        [
          'AUTO_APPROVAL_TRIP_REQUEST',
          // 'PICKUP_EDIT_CUTOFF',
          // 'DROP_EDIT_CUTOFF',
        ],
        { orgID: user?.orgID },
      );
      const approvalType = configResponse?.data?.['Auto approval trip request'];
      // const pickupEditCutoff = configResponse?.data?.['PICKUP_EDIT_CUTOFF'];
      // const dropEditCutoff = configResponse?.data?.['DROP_EDIT_CUTOFF'];

      // const pickupEditCutoffMins = parseInt(pickupEditCutoff, 10);
      // const dropEditCutoffMins = parseInt(dropEditCutoff, 10);

      const { pickupConfig, dropConfig } = await this.resolveTeamCutoffConfig(
        employee,
        user?.orgID,
        'EDIT',
        'PICKUP_EDIT_CUTOFF',
        'DROP_EDIT_CUTOFF',
      );
      //  Cutoff check using EXISTING request's shiftTime and date
      // if (existingRequest.pickDrop === true) {
      //   // PICK request
      //   if (
      //     !this.isWithinCutoffWindow(
      //       existingRequest.shiftTime,
      //       pickupEditCutoffMins,
      //       existingRequest.date,
      //     )
      //   ) {
      //     throw new BadRequestException(
      //       `Cannot update pick request. Edit window of ${pickupEditCutoffMins} minutes before shift time has passed.`,
      //     );
      //   }
      // } else if (existingRequest.pickDrop === false) {
      //   // DROP request
      //   if (
      //     !this.isWithinCutoffWindow(
      //       existingRequest.shiftTime,
      //       dropEditCutoffMins,
      //       existingRequest.date,
      //     )
      //   ) {
      //     throw new BadRequestException(
      //       `Cannot update drop request. Edit window of ${dropEditCutoffMins} minutes before shift time has passed.`,
      //     );
      //   }
      // }
      // NEW : TEAM CONFIG CHECK ADDED
      if (existingRequest.pickDrop === true) {
        this.validateEditCancelCutoff(
          pickupConfig,
          existingRequest.shiftTime,
          existingRequest.date,
          'update',
          'pick',
        );
      } else if (existingRequest.pickDrop === false) {
        this.validateEditCancelCutoff(
          dropConfig,
          existingRequest.shiftTime,
          existingRequest.date,
          'update',
          'drop',
        );
      }
      const updatedStatus =
        approvalType === 'Yes'
          ? RequestStatus.Approved
          : RequestStatus.Requested;

      const eventPayload = JSON.parse(JSON.stringify(updateTripRequestInput));
      if (eventPayload.loginTime !== undefined) {
        eventPayload.shiftTime = eventPayload.loginTime;
        delete eventPayload.loginTime;
      }
      if (eventPayload.logoutTime !== undefined) {
        eventPayload.dropTime = eventPayload.logoutTime;
        delete eventPayload.logoutTime;
      }

      // Captured before existingRequest.pickDrop is mutated to a string
      // label below — needed here purely to decide whether this trip
      // request is a Pick (login time) or Drop (logout time) request, so
      // the shiftTime diff can be labeled correctly instead of the
      // ambiguous generic "Shift Time".
      const isPickRequest =
        typeof updateTripRequestInput.pickDrop === 'boolean'
          ? updateTripRequestInput.pickDrop
          : existingRequest.pickDrop;
      const shiftTimeLabel = isPickRequest
        ? 'Shift Time (Login)'
        : 'Shift Time (Logout)';
      const newShiftTimeForDiff = updateTripRequestInput.loginTime
        ? normalizeTime(updateTripRequestInput.loginTime)
        : updateTripRequestInput.logoutTime
        ? normalizeTime(updateTripRequestInput.logoutTime)
        : undefined;

      // Built explicitly rather than relying on eventlogService's
      // automatic key-matching diff (createChangeJson) — that approach
      // silently skipped shiftTime entirely, since the DTO sends
      // loginTime/logoutTime while the model column is shiftTime, and
      // createChangeJson only compares fields whose keys match exactly
      // on both sides. Explicit diff also lets shiftTime get a
      // direction-aware label instead of a flat, ambiguous "Shift Time".
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};

      const newDate = updateTripRequestInput?.selectedDates?.[0];
      if (newDate !== undefined && newDate !== existingRequest.date) {
        changeJSON['Date'] = {
          OldValue: existingRequest.date,
          newValue: newDate,
        };
      }

      if (
        newShiftTimeForDiff !== undefined &&
        newShiftTimeForDiff !== existingRequest.shiftTime
      ) {
        changeJSON[shiftTimeLabel] = {
          OldValue: existingRequest.shiftTime,
          newValue: newShiftTimeForDiff,
        };
      }

      if (
        updateTripRequestInput.locationType !== undefined &&
        updateTripRequestInput.locationType !== existingRequest.locationType
      ) {
        changeJSON['Location Type'] = {
          OldValue: existingRequest.locationType,
          newValue: updateTripRequestInput.locationType,
        };
      }

      if (
        updateTripRequestInput.officeLocation !== undefined &&
        updateTripRequestInput.officeLocation !== existingRequest.officeLocation
      ) {
        changeJSON['Office Location'] = {
          OldValue: existingRequest.officeLocation,
          newValue: updateTripRequestInput.officeLocation,
        };
      }

      // AdHoc requests get their own module/description ("updated N
      // fields in Adhoc Trip Request") so they're distinguishable from
      // regular scheduled trip edits in the event log.
      const objectType = this.resolveTripRequestObjectType(
        existingRequest.emergencyType,
      );
      const eventLog = {
        objectType,
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user?.orgID ?? null,
        updatedBy: user.name,
        payload: requestById.data,
        requestPayload: eventPayload,
        changeJSON,
        user,
      };
      this.eventlogService.create(eventLog);
      const tripRequest = await this.tripRequestModel.findOne({
        where: {
          tripID: {
            [Op.ne]: null, // tripID should not be null
          },
          id: id,
        },
      });
      const newShiftTime = updateTripRequestInput.loginTime
        ? normalizeTime(updateTripRequestInput.loginTime)
        : normalizeTime(updateTripRequestInput.logoutTime);
      if (tripRequest) {
        const trip = await this.tripModel.findOne({
          where: { id: tripRequest.tripID },
        });
        if (trip.lockStatus === Status.Active) {
          throw new BadRequestException(
            `Trip request belongs to a locked trip, cannot be updated.`,
          );
        }
        const updatedEmployees = (trip.employees || []).filter(
          (emp: any) => emp.tripRequestID !== String(id),
        );
        // Count how many requests are still linked to this trip
        const tripRequestsCount = await this.tripRequestModel.count({
          where: {
            tripID: trip.id,
            status: {
              [Op.notIn]: [Status.Rejected, Status.Cancelled], // exclude both
            },
          },
        });

        if (tripRequestsCount <= 1) {
          // This was the only request in the trip → cancel trip
          await trip.update({
            status: TripStatus.Cancelled,
            employees: [],
          });
        } else {
          // Update employees list
          await trip.update({ employees: updatedEmployees });
        }
        const updatedTrip = await this.tripRequestModel.update(
          {
            ...updateTripRequestInput,
            date: updateTripRequestInput?.selectedDates[0],
            shiftTime: updateTripRequestInput.loginTime
              ? normalizeTime(updateTripRequestInput.loginTime)
              : normalizeTime(updateTripRequestInput.logoutTime),
            emergencyType: updateTripRequestInput?.emergencyType,
            status: updatedStatus ?? RequestStatus.Requested,
            tripID: null,
          },
          {
            where: { id },
            returning: true,
          },
        );
        this.sendShiftScheduleEmail(
          user?.orgID,
          'updated',
          employee?.data?.name,
          employee?.data?.employeeCode,
          updateTripRequestInput?.selectedDates[0],
          existingRequest.shiftTime,
          newShiftTime,
        );
        return {
          message: 'Trip request updated successfully',
          data: updatedTrip?.[1]?.[0],
        };
      } else {
        const updatedTrip = await this.tripRequestModel.update(
          {
            ...updateTripRequestInput,
            date: updateTripRequestInput?.selectedDates[0],
            shiftTime: updateTripRequestInput.loginTime
              ? normalizeTime(updateTripRequestInput.loginTime)
              : normalizeTime(updateTripRequestInput.logoutTime),
            emergencyType: updateTripRequestInput?.emergencyType,
            status: updatedStatus ?? RequestStatus.Requested,
          },
          {
            where: { id },
            returning: true,
          },
        );
        this.sendShiftScheduleEmail(
          user?.orgID,
          'updated',
          employee?.data?.name,
          employee?.data?.employeeCode,
          updateTripRequestInput?.selectedDates[0],
          existingRequest.shiftTime,
          newShiftTime,
        );
        return {
          message: 'Trip request updated successfully',
          data: updatedTrip?.[1]?.[0],
        };
      }
    } catch (error) {
      if (error.status !== 500) {
        this.eventlogService.create({
          objectType: this.resolveTripRequestObjectType(
            existingRequest?.emergencyType,
          ),
          changeType: 'edit-failed',
          objectID: id,
          authID: user?.id,
          orgID: user?.orgID ?? null,
          updatedBy: user?.name,
          payload: {
            tripRequestID: id,
            employeeID: existingRequest?.employeeID,
            employeeName: employee?.data?.name ?? null,
            employeeCode:
              employee?.data?.employeeCode ??
              existingRequest?.employeeCode ??
              null,
            selectedDates: updateTripRequestInput?.selectedDates,
            loginTime: updateTripRequestInput?.loginTime,
            logoutTime: updateTripRequestInput?.logoutTime,
          },
          requestPayload: updateTripRequestInput,
          customDescription: `attempted to update Trip Request - ${error.message}`,
          user,
        });
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  private async sendShiftScheduleEmail(
    orgID: bigint | string,
    changeType: 'updated' | 'cancelled',
    employeeName: string,
    employeeCode: string,
    shiftDate: string,
    shiftTime: string,
    newShiftTime?: string,
  ): Promise<void> {
    try {
      // const moment = require('moment');
      const emailRecipientsConfig = await this.configService.getConfigValue(
        'ADMIN_EMAIL_ALERT_RECIPIENTS',
        BigInt(orgID),
      );

      if (!emailRecipientsConfig) {
        this.logger.warn(
          `[SHIFT SCHEDULE EMAIL] No recipients configured for org ${orgID}. Skipping.`,
        );
        return;
      }

      const emailRecipients = emailRecipientsConfig
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      if (emailRecipients.length === 0) return;

      const subjectAction =
        changeType === 'cancelled' ? 'Cancelled' : 'Updated';
      await this.emailService.sendEmail({
        mailTo: emailRecipients,
        subject: `Shift Schedule ${subjectAction} – ${employeeName} (${employeeCode})`,
        templateName: 'shift-schedule-alert',
        mailBody: {
          changeType,
          employee_name: employeeName,
          employee_code: employeeCode,
          shift_date: moment(shiftDate).format('DD-MM-YYYY'),
          shift_time: shiftTime,
          new_shift_time: newShiftTime,
        },
        isAttachments: false,
        attachments: [],
      });

      this.logger.log(
        `[SHIFT SCHEDULE EMAIL] Shift schedule ${changeType} email sent successfully for org ${orgID}`,
      );
    } catch (error) {
      this.logger.error(
        `[SHIFT SCHEDULE EMAIL] Failed to send shift schedule ${changeType} email for org ${orgID}:`,
        error,
      );
    }
  }

  //   async emergencyTripUpdate(
  //     updateTripRequestInput: UpdateTripRequestInput,
  //     user: any,
  //   ): Promise<any> {
  //     try {
  //       console.log('updateTripRequestInput---', updateTripRequestInput);
  //       const date = updateTripRequestInput?.selectedDates[0];
  //       const tripRequests = await this.tripRequestModel.findAll({
  //         // where: {
  //         //   date: date,
  //         //   employeeID: user?.employeeID,
  //         //   status: {
  //         //     [Op.in]: [Status.Approved, Status.Requested],
  //         //   },
  //         //   shiftTime: {
  //         //     [Op.notIn]: [
  //         //       updateTripRequestInput?.loginTime,
  //         //       updateTripRequestInput?.logoutTime,
  //         //     ],
  //         //   },
  //         // },
  //         where: {
  //           [Op.and]: [
  //             Sequelize.where(
  //               Sequelize.fn('DATE', Sequelize.col('date')),
  //               '=',
  //               date,
  //             ),
  //             { employeeID: user?.employeeID },
  //             { status: { [Op.in]: [Status.Approved, Status.Requested] } },
  //             {
  //               shiftTime: {
  //                 [Op.notIn]: [
  //                   updateTripRequestInput?.loginTime
  //                     ? updateTripRequestInput?.loginTime
  //                     : '',
  //                   updateTripRequestInput?.logoutTime,
  //                 ],
  //               },
  //             },
  //           ],
  //         },
  //         attributes: [
  //           'id',
  //           'employeeID',
  //           'employeeCode',
  //           'date',
  //           'shiftTime',
  //           'pickDrop',
  //           'status',
  //           'tripID',
  //         ],
  //       });
  //       console.log('tripRequests--', tripRequests);
  //       if (tripRequests.length <= 0) {
  //         throw new NotFoundException(
  //           'There is no change in your login/logout time.',
  //         );
  //       } else {
  //         const tripRequestIds = tripRequests.map((trip) => trip.id);
  //         await this.tripRequestModel.update(
  //           { status: Status.Cancelled }, // Assuming `Cancelled` is a valid status
  //           { where: { id: tripRequestIds } },
  //         );
  //         const employee = await this.employeeService.findOne(user?.employeeID);

  //         const approvalType = await this.configService.getConfigValue(
  //           'AUTO_APPROVAL_TRIP_REQUEST',
  //           user?.orgID,
  //         );

  //         const updatedStatus =
  //           approvalType === 'Yes' ? Status.Approved : Status.Requested;
  //         console.log("tripRequests000--",tripRequests);
  //         const newTripRequests = tripRequests.map((trip) => ({
  //           orgID: user?.orgID,
  //           employeeID: user?.employeeID,
  //           employeeCode: employee?.data?.employeeCode,
  //           date: updateTripRequestInput?.selectedDates[0],
  //           shiftTime:
  //             trip?.pickDrop === true
  //               ? normalizeTime(updateTripRequestInput?.loginTime)
  //               : normalizeTime(updateTripRequestInput?.logoutTime),
  //           pickDrop: trip?.pickDrop,
  //           status: updatedStatus,
  //           emergencyType: updateTripRequestInput?.emergencyType, // Set emergency type
  //           locationType: updateTripRequestInput?.locationType,
  //         }));

  //         await this.tripRequestModel.bulkCreate(newTripRequests);

  //         const tripIDs = tripRequests.map((trip) => trip.tripID);

  //         if (tripIDs.length > 0) {
  //           // Remove employee from the trip
  //           await this.tripService.removeEmployeeFromTrips(tripIDs, user);
  //         }
  //       }

  //       return {
  //         message: 'Emergency trip request added successfully',
  //         data: null,
  //       };
  //     } catch (error) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //       throw new InternalServerErrorException(error);
  //     }
  //   }

  async emergencyTripUpdate(
    updateTripRequestInput: EmergencyTripRequestInput,
    user: any,
  ): Promise<any> {
    try {
      const date = updateTripRequestInput?.selectedDates[0];
      const employeeID = user?.employeeID;

      // Determine which trips to update based on payload
      let pickDropCondition: any = {};
      if (
        updateTripRequestInput?.loginTime &&
        !updateTripRequestInput?.logoutTime
      ) {
        pickDropCondition = { pickDrop: true }; // only login
      } else if (
        !updateTripRequestInput?.loginTime &&
        updateTripRequestInput?.logoutTime
      ) {
        pickDropCondition = { pickDrop: false }; // only logout
      } // if both present, no filter → update both

      const whereCondition: any = {
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn('DATE', Sequelize.col('date')),
            '=',
            date,
          ),
          { employeeID },
          { status: { [Op.in]: [Status.Approved, Status.Requested] } },
          pickDropCondition,
        ],
      };

      const tripRequests = await this.tripRequestModel.findAll({
        where: whereCondition,
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'status',
          'tripID',
        ],
      });

      if (tripRequests.length <= 0) {
        throw new NotFoundException('No matching trips found to update.');
      }

      // Cancel existing trips
      const tripRequestIds = tripRequests.map((trip) => trip.id);
      await this.tripRequestModel.update(
        { status: Status.Cancelled },
        { where: { id: tripRequestIds } },
      );

      // Prepare new trips
      const employee = await this.employeeService.findOne(employeeID);
      const approvalType = await this.configService.getConfigValue(
        'AUTO_APPROVAL_TRIP_REQUEST',
        user?.orgID,
      );
      const updatedStatus =
        approvalType === 'Yes' ? Status.Approved : Status.Requested;

      const newTripRequests = tripRequests.map((trip) => {
        const newShiftTime =
          trip.pickDrop === true
            ? normalizeTime(updateTripRequestInput?.loginTime)
            : normalizeTime(updateTripRequestInput?.logoutTime);

        return {
          orgID: user?.orgID,
          employeeID,
          employeeCode: employee?.data?.employeeCode,
          date,
          shiftTime: newShiftTime,
          pickDrop: trip.pickDrop,
          status: updatedStatus,
          emergencyType: updateTripRequestInput?.emergencyType,
          //   locationType: updateTripRequestInput?.locationType,
        };
      });

      await this.tripRequestModel.bulkCreate(newTripRequests);

      // Remove employee from existing trips if needed
      const tripIDs = tripRequests.map((trip) => trip.tripID).filter(Boolean);
      if (tripIDs.length > 0) {
        await this.tripService.removeEmployeeFromTrips(tripIDs, user);
      }

      return {
        message: 'Emergency trip request updated successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async adminEmergencyTripUpdate(
    updateTripRequestInput: UpdateTripRequestInput,
    user: any,
  ): Promise<any> {
    try {
      const [loginTime, logoutTime, selectedDate] = [
        updateTripRequestInput?.loginTime,
        updateTripRequestInput?.logoutTime,
        updateTripRequestInput?.selectedDates[0],
        updateTripRequestInput?.emergencyType,
      ];

      const employeeIDs =
        await this.employeeService.findEmployeesWithEmployeeCode(
          updateTripRequestInput?.employeeCodes,
          user?.orgID,
        );
      if (employeeIDs.length == 0) {
        throw new NotFoundException('Invalid employee codes found.');
      }
      const employeeIdList = employeeIDs.map((emp) => emp.id);

      const tripRequests = await this.tripRequestModel.findAll({
        where: {
          date: selectedDate,
          employeeID: { [Op.in]: employeeIdList },
          status: { [Op.in]: [Status.Approved, Status.Requested] },
        },
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'status',
          'tripID',
        ],
      });

      const isAutoApprovalEnabled =
        (await this.configService.getConfigValue(
          'AUTO_APPROVAL_TRIP_REQUEST',
          user?.orgID,
        )) === 'Yes';
      const updatedStatus = isAutoApprovalEnabled
        ? Status.Approved
        : Status.Requested;

      const tripRequestIdsToCancel: number[] = [];
      const tripIDsToUpdate: number[] = [];
      const newTripRequests: any[] = [];
      const duplicateRequests: any[] = [];
      const isAlreadyExist: any[] = [];

      const processTrip = (emp, pickDrop: boolean, shiftTime: string) => {
        if (!shiftTime) return;

        const employeeTrips = tripRequests.filter(
          (trip) => trip.employeeID === emp.id,
        );
        const isDuplicate = employeeTrips.find(
          (trip) => trip.pickDrop === pickDrop && trip.shiftTime === shiftTime,
        );

        if (isDuplicate) {
          duplicateRequests.push({
            id: isDuplicate.id,
            emergencyType: updateTripRequestInput?.emergencyType,
            locationType: updateTripRequestInput?.locationType,
          });
          return;
        }

        const outdatedTrips = employeeTrips.filter(
          (trip) => trip.pickDrop === pickDrop && trip.shiftTime !== shiftTime,
        );

        for (const trip of outdatedTrips) {
          tripRequestIdsToCancel.push(Number(trip.id));
          if (trip.tripID) tripIDsToUpdate.push(Number(trip.id));
        }

        newTripRequests.push({
          orgID: user?.orgID,
          employeeID: emp.id,
          employeeCode: emp.employeeCode,
          date: selectedDate,
          shiftTime,
          pickDrop,
          status: updatedStatus,
          emergencyType: updateTripRequestInput?.emergencyType,
          locationType: updateTripRequestInput?.locationType,
          locationID: emp.locationID,
          locationName: emp.location?.name,
          remarks: updateTripRequestInput?.remarks ?? null,
        });
      };

      for (const emp of employeeIDs) {
        processTrip(emp, true, loginTime);
        processTrip(emp, false, logoutTime);
      }

      // Batch updates
      if (tripRequestIdsToCancel.length)
        await this.tripRequestModel.update(
          { status: Status.Cancelled },
          { where: { id: tripRequestIdsToCancel } },
        );

      // if (duplicateRequests.length) {
      //   const updatePromises = duplicateRequests.map((d) =>
      //     this.tripRequestModel.update(
      //       {
      //         emergencyType: d.emergencyType,
      //         locationType: d.locationType,
      //       },
      //       { where: { id: d.id } }, //
      //     ),
      //   );
      //   await Promise.all(updatePromises);
      // }

      if (newTripRequests.length)
        await this.tripRequestModel.bulkCreate(newTripRequests);

      if (tripIDsToUpdate.length)
        await this.tripService.removeEmployeeFromTrips(tripIDsToUpdate, user);

      // Compose message
      let message = 'Emergency trip request processed successfully';
      if (isAlreadyExist.length)
        throw new NotFoundException('Duplicate trip request cannot be created');
      else if (newTripRequests.length)
        message = 'Emergency trip requests processed - new requests created';
      // if (duplicateRequests.length && !newTripRequests.length)
      //   message =
      //     'Duplicate trip requests found and updated with emergency details';
      // else if (duplicateRequests.length && newTripRequests.length)
      //   message =
      //     'Emergency trip requests processed - some duplicates updated, new requests created';

      if (
        !tripRequestIdsToCancel.length &&
        !newTripRequests.length &&
        !duplicateRequests.length
      ) {
        throw new NotFoundException(
          'There is no valid login/logout time provided or no changes detected.',
        );
      }

      return {
        message,
        data: {
          cancelled: tripRequestIdsToCancel.length,
          created: newTripRequests.length,
          updated: duplicateRequests.length,
        },
      };
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async employeeEmergencyTripRequestUpdate(
    updateTripRequestInput: EmployeeEmergencyTripRequestInput,
    user: any,
  ): Promise<any> {
    try {
      const organizationID = user?.orgID;
      const employeeID = user?.employeeID;

      const {
        loginTime,
        logoutTime,
        emergencyType,
        remarks,
        selectedDates,
        locationType,
      } = updateTripRequestInput;

      const selectedDate = selectedDates?.[0];

      // ✅ Validate AdHoc time cutoffs
      if (emergencyType === 'AdHoc') {
        await this.validateEmergencyCutoffs(
          emergencyType,
          selectedDate,
          loginTime,
          logoutTime,
          organizationID,
        );
      }
      const employee = await this.employeeService.findOne(employeeID);
      if (!employee) {
        throw new BadRequestException(`Invalid employee ID: ${employeeID}`);
      }
      //  Check for existing trip requests
      const tripRequests = await this.tripRequestModel.findAll({
        where: {
          date: selectedDate,
          employeeID,
          status: { [Op.in]: [Status.Approved, Status.Requested] },
        },
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'status',
          'tripID',
          'emergencyType',
        ],
      });

      const isAutoApprovalEnabled =
        (await this.configService.getConfigValue(
          'AUTO_APPROVAL_TRIP_REQUEST',
          organizationID,
        )) === 'Yes';

      const updatedStatus = isAutoApprovalEnabled
        ? Status.Approved
        : Status.Requested;

      const invalidIssues: string[] = [];
      const newTripRequests: any[] = [];
      const otp = generateOTP();

      const hasLogin = tripRequests.some((trip) => trip.pickDrop === true);
      const hasLogout = tripRequests.some((trip) => trip.pickDrop === false);

      const wantsLogin = !!loginTime;
      const wantsLogout = !!logoutTime;

      //  Conflict validations
      if (wantsLogin && hasLogin) {
        invalidIssues.push(`Already has a request for pick on ${selectedDate}`);
      }
      if (wantsLogout && hasLogout) {
        invalidIssues.push(`Already has a request for drop on ${selectedDate}`);
      }

      if (invalidIssues.length > 0) {
        throw new BadRequestException(invalidIssues.join('\n'));
      }

      //  Prepare new trip requests
      const baseTripData = {
        orgID: organizationID,
        employeeID,
        employeeCode: employee.data.employeeCode,
        date: selectedDate,
        status: updatedStatus,
        emergencyType,
        locationType,
        locationID: employee.data.locationID,
        locationName: employee.data.location?.name,
        remarks: remarks?.trim() || null,
        attendanceOtp: otp,
      };

      if (wantsLogin) {
        newTripRequests.push({
          ...baseTripData,
          shiftTime: normalizeTime(loginTime),
          pickDrop: true,
        });
      }

      if (wantsLogout) {
        newTripRequests.push({
          ...baseTripData,
          shiftTime: normalizeTime(logoutTime),
          pickDrop: false,
        });
      }

      const trips = await this.tripRequestModel.bulkCreate(newTripRequests);

      // Event log — objectType is conditional on emergencyType so AdHoc
      // requests get their own distinct module + description ("created
      // new Adhoc Trip Request") instead of the generic "Trip Request"
      // label. attendanceOtp is deliberately excluded from payload, same
      // as the other trip-request creation logs in this service.
      const objectType = this.resolveTripRequestObjectType(emergencyType);

      const eventLogs = trips.map((trip) => ({
        objectType,
        changeType: 'add',
        objectID: trip.id,
        authID: user.id,
        orgID: organizationID,
        updatedBy: user.name,
        payload: {
          date: trip.date,
          shiftTime: trip.shiftTime,
          pickDrop: trip.pickDrop ? PickDrop.Pick : PickDrop.Drop,
          emergencyType: trip.emergencyType,
          remarks: trip.remarks,
        },
        requestPayload: JSON.parse(JSON.stringify(updateTripRequestInput)),
        user,
      }));
      this.eventlogService.bulkCreate(eventLogs);

      return {
        message: `${trips.length} trip request(s) created successfully.`,
        data: trips[0],
      };
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async adminEmergencyTripRequestUpdate(
    updateTripRequestInput: UpdateTripRequestInput,
    user: any,
  ): Promise<any> {
    try {
      const organizationID = user?.orgID;

      const [loginTime, logoutTime, selectedDate] = [
        updateTripRequestInput?.loginTime,
        updateTripRequestInput?.logoutTime,
        updateTripRequestInput?.selectedDates[0],
        updateTripRequestInput?.emergencyType,
      ];

      // Resolved once for the whole batch — emergencyType is shared across
      // every trip request created in this call, so the objectType (and
      // therefore the event log description) is the same for all of them.
      const objectType = this.resolveTripRequestObjectType(
        updateTripRequestInput?.emergencyType,
      );

      // Logs whatever bulkCreate() actually returned for a given call site.
      // Fire-and-forget, consistent with the rest of this service.
      const logCreatedTrips = (createdTrips: any[]) => {
        if (!createdTrips?.length) return;
        const eventLogs = createdTrips.map((trip) => ({
          objectType,
          changeType: 'add',
          objectID: trip.id,
          authID: user.id,
          orgID: organizationID,
          updatedBy: user.name,
          payload: {
            date: trip.date,
            shiftTime: trip.shiftTime,
            pickDrop: trip.pickDrop ? PickDrop.Pick : PickDrop.Drop,
            emergencyType: trip.emergencyType,
            remarks: trip.remarks,
          },
          requestPayload: JSON.parse(JSON.stringify(updateTripRequestInput)),
          user,
        }));
        this.eventlogService.bulkCreate(eventLogs);
      };

      if (updateTripRequestInput?.emergencyType == 'AdHoc') {
        await this.validateEmergencyCutoffs(
          updateTripRequestInput?.emergencyType,
          selectedDate,
          loginTime,
          logoutTime,
          organizationID,
        );
      }

      const invalidEmployees: any[] = [];
      const newTripRequests: any[] = [];
      const employeeIDs =
        await this.employeeService.findEmployeesWithEmployeeCode(
          updateTripRequestInput?.employeeCodes,
          user?.orgID,
        );

      if (employeeIDs?.length == 0) {
        throw new BadRequestException(
          `Invalid employee codes found: ${updateTripRequestInput?.employeeCodes}.`,
        );
      }
      const employeeIdList = employeeIDs.map((emp) => emp.id);

      const tripRequests = await this.tripRequestModel.findAll({
        where: {
          date: selectedDate,
          employeeID: { [Op.in]: employeeIdList },
          status: { [Op.in]: [Status.Approved, Status.Requested] },
        },
        attributes: [
          'id',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'status',
          'tripID',
          'emergencyType',
        ],
      });
      const isAutoApprovalEnabled =
        (await this.configService.getConfigValue(
          'AUTO_APPROVAL_TRIP_REQUEST',
          user?.orgID,
        )) === 'Yes';
      const updatedStatus = isAutoApprovalEnabled
        ? Status.Approved
        : Status.Requested;
      for (const emp of employeeIDs) {
        const otp = generateOTP();
        const employeeTrips = tripRequests.filter(
          (trip) => trip.employeeID === emp.id,
        );
        const hasLogin = employeeTrips.some((trip) => trip.pickDrop === true);
        const hasLogout = employeeTrips.some((trip) => trip.pickDrop === false);

        const wantsLogin = !!loginTime;
        const wantsLogout = !!logoutTime;

        if (wantsLogin && !wantsLogout && hasLogin) {
          invalidEmployees.push({
            employee: emp.employeeCode,
            issue: `already has a request for pick on ${selectedDate}`,
          });
        }

        if (!wantsLogin && wantsLogout && hasLogout) {
          invalidEmployees.push({
            employee: emp.employeeCode,
            issue: `already has a request for drop  on ${selectedDate}`,
          });
        }

        if (wantsLogin && wantsLogout) {
          if (hasLogin && hasLogout) {
            invalidEmployees.push({
              employee: emp.employeeCode,
              issue: `already has request for both pick and drop on ${selectedDate}`,
            });
          } else if (hasLogin) {
            newTripRequests.push({
              orgID: user?.orgID,
              employeeID: emp.id,
              employeeCode: emp.employeeCode,
              date: selectedDate,
              shiftTime: normalizeTime(logoutTime),
              pickDrop: false,
              status: updatedStatus,
              emergencyType: updateTripRequestInput?.emergencyType,
              locationType: updateTripRequestInput?.locationType,
              locationID: emp.locationID,
              locationName: emp.location?.name,
              remarks: updateTripRequestInput?.remarks ?? null,
              attendanceOtp: otp,
            });
            const createdTrips = await this.tripRequestModel.bulkCreate(
              newTripRequests,
            );
            logCreatedTrips(createdTrips);
            invalidEmployees.push({
              employee: emp.employeeCode,
              issue: `already has a request for pick on ${selectedDate}. Only request for drop is created.`,
            });
          } else if (hasLogout) {
            newTripRequests.push({
              orgID: user?.orgID,
              employeeID: emp.id,
              employeeCode: emp.employeeCode,
              date: selectedDate,
              shiftTime: normalizeTime(loginTime),
              pickDrop: true,
              status: updatedStatus,
              emergencyType: updateTripRequestInput?.emergencyType,
              locationType: updateTripRequestInput?.locationType,
              locationID: emp.locationID,
              locationName: emp.location?.name,
              remarks: updateTripRequestInput?.remarks ?? null,
              attendanceOtp: otp,
            });
            const createdTrips = await this.tripRequestModel.bulkCreate(
              newTripRequests,
            );
            logCreatedTrips(createdTrips);
            invalidEmployees.push({
              employee: emp.employeeCode,
              issue: `already has a request for drop on ${selectedDate}. Only request for pick is created.`,
            });
          }
        }
      }

      if (invalidEmployees.length > 0) {
        throw new BadRequestException(
          `${invalidEmployees
            .map((e) => `Employee ${e.employee} ${e.issue}`)
            .join('\n')}`,
        );
      } else {
        for (const emp of employeeIDs) {
          const otp = generateOTP();
          if (loginTime) {
            newTripRequests.push({
              orgID: user?.orgID,
              employeeID: emp.id,
              employeeCode: emp.employeeCode,
              date: selectedDate,
              shiftTime: normalizeTime(loginTime),
              pickDrop: true,
              status: updatedStatus,
              emergencyType: updateTripRequestInput?.emergencyType,
              locationType: updateTripRequestInput?.locationType,
              locationID: emp.locationID,
              locationName: emp.location?.name,
              remarks: updateTripRequestInput?.remarks ?? null,
              attendanceOtp: otp,
            });
          }
          if (logoutTime) {
            newTripRequests.push({
              orgID: user?.orgID,
              employeeID: emp.id,
              employeeCode: emp.employeeCode,
              date: selectedDate,
              shiftTime: normalizeTime(logoutTime),
              pickDrop: false,
              status: updatedStatus,
              emergencyType: updateTripRequestInput?.emergencyType,
              locationType: updateTripRequestInput?.locationType,
              locationID: emp.locationID,
              locationName: emp.location?.name,
              remarks: updateTripRequestInput?.remarks ?? null,
              attendanceOtp: otp,
            });
          }
        }
        const trips = await this.tripRequestModel.bulkCreate(newTripRequests);
        return {
          message: `${trips.length} trip request(s) created successfully.`,
          data: trips[0],
        };
        return;
      }
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  private async validateEmergencyCutoffs(
    emergencyType: string,
    selectedDate: string,
    loginTime?: string,
    logoutTime?: string,
    orgID?: string,
  ) {
    // Get lower & upper cutoff values from config
    // const lowerCutoffValue = await this.configService.getEmergencyCutOffValue(
    //   `${emergencyType} lower cut off`,
    //   orgID,
    // );
    // const upperCutoffValue = await this.configService.getEmergencyCutOffValue(
    //   `${emergencyType} upper cut off`,
    //   orgID,
    // );
    const configResponse = await this.configService.getMultipleConfigValues(
      [`${emergencyType} lower cut off`, `${emergencyType} upper cut off`],
      { orgID: orgID },
    );

    const {
      [`${emergencyType} lower cut off`]: lowerCutoffValue,
      [`${emergencyType} upper cut off`]: upperCutoffValue,
    } = configResponse?.data || {};

    const lowerCutoff = parseInt(lowerCutoffValue, 10) || 0;
    const upperCutoff = parseInt(upperCutoffValue, 10) || 0;

    const now = moment();

    const checkTime = (time: string, pickDrop: 'login' | 'logout') => {
      if (!time) return;

      // Build the selected datetime (today + chosen time)
      const selectedTime = moment(selectedDate).set({
        hour: parseInt(time.split(':')[0], 10),
        minute: parseInt(time.split(':')[1], 10),
        second: 0,
        millisecond: 0,
      });

      const diffInHours = selectedTime.diff(now, 'hours', true);

      // Lower cutoff violation
      if (lowerCutoff && diffInHours < lowerCutoff) {
        throw new BadRequestException(
          `Trip request cannot be created. The selected ${pickDrop} time ${selectedTime.format(
            'DD/MM/YYYY HH:mm',
          )} is within the lower cutoff of ${lowerCutoff} hour(s) for ${emergencyType}.`,
        );
      }

      // Upper cutoff violation
      if (upperCutoff && diffInHours > upperCutoff) {
        throw new BadRequestException(
          `Trip request cannot be created. The selected ${pickDrop} time ${selectedTime.format(
            'DD/MM/YYYY HH:mm',
          )} exceeds the upper cutoff of ${upperCutoff} hour(s) for ${emergencyType}.`,
        );
      }
    };

    checkTime(loginTime, 'login');
    checkTime(logoutTime, 'logout');
  }

  private async assignAvailableSpoc(tripID: any): Promise<void> {
    const trip = await this.tripModel.findOne({ where: { id: tripID } });
    if (!trip) return;
    await trip.update({
      spock: true,
      spockID: null,
      spockCode: null,
    });
  }

  //used for both cancel and update cutoffs
  // private isWithinCutoffWindow(
  //   shiftTime: string, // e.g. "10:30"
  //   cutoffMinutes: number, // e.g. 180
  //   tripDate: string, // e.g. "2026-04-09"
  // ): boolean {
  //   // Combine trip date + shiftTime into a full datetime
  //   // e.g. "2026-04-09 10:30"
  //   const shiftDateTime = moment(
  //     `${moment(tripDate).format('YYYY-MM-DD')} ${shiftTime}`,
  //     'YYYY-MM-DD HH:mm',
  //   );

  //   // Deadline = shiftTime - cutoffMinutes
  //   // e.g. 10:30 - 180 mins = 07:30
  //   const deadline = shiftDateTime.clone().subtract(cutoffMinutes, 'minutes');

  //   const now = moment();

  //   // Allow cancel only if current time is BEFORE the deadline
  //   return now.isBefore(deadline);
  // }

  private async resolveTeamCutoffConfig(
    employee: any,
    organizationID: bigint,
    action: 'EDIT' | 'CANCEL',
    orgPickupKey: string, // 'PICKUP_EDIT_CUTOFF' | 'PICKUP_DELETE_CUTOFF'
    orgDropKey: string, // 'DROP_EDIT_CUTOFF' | 'DROP_DELETE_CUTOFF'
  ): Promise<{ pickupConfig: string; dropConfig: string }> {
    // ----------------------------
    // Org config is raw minutes e.g. "180" -> normalize to "minutes,180"
    // ----------------------------
    const configResponse = await this.configService.getMultipleConfigValues(
      [orgPickupKey, orgDropKey],
      { orgID: organizationID },
    );

    const orgPickupMins =
      parseInt(configResponse?.data?.[orgPickupKey], 10) || 0;
    const orgDropMins = parseInt(configResponse?.data?.[orgDropKey], 10) || 0;

    let pickupConfig = `minutes,${orgPickupMins}`;
    let dropConfig = `minutes,${orgDropMins}`;

    const team = employee?.data?.team;

    // No team, or team config disabled -> org fallback
    if (!team || !team.isTeamConfigEnabled) {
      return { pickupConfig, dropConfig };
    }

    const actionConfig = team.teamConfig?.[action]; // team.teamConfig.EDIT or .CANCEL

    // Action block missing entirely -> org fallback
    if (!actionConfig) {
      return { pickupConfig, dropConfig };
    }

    // PICK
    if (actionConfig.PICK === '') {
      pickupConfig = 'minutes,0'; // no restriction, shift-passed check still applies
    } else if (actionConfig.PICK != null) {
      pickupConfig = actionConfig.PICK; // already in "minutes,180" / "daily,..." form
    }

    // DROP
    if (actionConfig.DROP === '') {
      dropConfig = 'minutes,0';
    } else if (actionConfig.DROP != null) {
      dropConfig = actionConfig.DROP;
    }

    return { pickupConfig, dropConfig };
  }

  private validateEditCancelCutoff(
    configValue: string, // "minutes,180" | "daily,previousday,19:00" | "daily,sameday,09:00"
    shiftTime: string, // "10:30"
    tripDate: string, // "2026-04-09"
    actionLabel: 'update' | 'cancel',
    pickDropLabel: 'pick' | 'drop',
  ): void {
    const now = moment();

    const parts = configValue.split(',').map((v) => v.trim());
    const mode = parts[0]?.toLowerCase();

    // ---------------- DISABLE (team-only) — checked before shift-passed, always blocks ----------------
    if (mode === 'disable') {
      throw new BadRequestException(
        `Cannot ${actionLabel} ${pickDropLabel} request. This action is disabled for your team. ` +
          `Please contact your administrator.`,
      );
    }

    const shiftDateTime = moment(
      `${moment(tripDate).format('YYYY-MM-DD')} ${shiftTime}`,
      'YYYY-MM-DD HH:mm',
    );

    // Shift already started/passed -> always blocked, regardless of cutoff mode
    if (!now.isBefore(shiftDateTime)) {
      throw new BadRequestException(
        `Cannot ${actionLabel} ${pickDropLabel} request. The ${pickDropLabel} time ` +
          `(${shiftDateTime.format('DD/MM/YYYY hh:mm A')}) has already passed.`,
      );
    }

    const windowLabel =
      actionLabel === 'update' ? 'Edit window' : 'Cancellation window';

    // ---------------- MINUTES (covers org config + team "minutes,N" + "" -> "minutes,0") ----------------
    if (mode === 'minutes') {
      const cutoffMinutes = Number(parts[1] ?? 0);
      if (cutoffMinutes > 0) {
        const deadline = shiftDateTime
          .clone()
          .subtract(cutoffMinutes, 'minutes');
        if (!now.isBefore(deadline)) {
          throw new BadRequestException(
            `Cannot ${actionLabel} ${pickDropLabel} request. ${windowLabel} of ` +
              `${cutoffMinutes} minutes before shift time has passed.`,
          );
        }
      }
      return; // cutoffMinutes === 0 -> no further restriction
    }

    // ---------------- DAILY (team-only) ----------------
    if (mode === 'daily') {
      const cutoffType = (parts[1] ?? '').toLowerCase(); // previousday | sameday
      const configuredCutoffTime = parts[2];

      if (!configuredCutoffTime) {
        throw new BadRequestException(
          `Invalid daily cutoff configuration for ${pickDropLabel} ${actionLabel}.`,
        );
      }

      const [configHour, configMinute] = configuredCutoffTime
        .split(':')
        .map(Number);

      if (cutoffType === 'previousday') {
        const cutoffDateTime = moment(tripDate).subtract(1, 'day').set({
          hour: configHour,
          minute: configMinute,
          second: 0,
          millisecond: 0,
        });
        if (!now.isBefore(cutoffDateTime)) {
          throw new BadRequestException(
            `Cannot ${actionLabel} ${pickDropLabel} request. ${windowLabel} ` +
              `(${cutoffDateTime.format(
                'DD/MM/YYYY hh:mm A',
              )}, previous day) has already passed.`,
          );
        }
        return;
      }

      if (cutoffType === 'sameday') {
        const cutoffDateTime = moment(tripDate).set({
          hour: configHour,
          minute: configMinute,
          second: 0,
          millisecond: 0,
        });
        if (!now.isBefore(cutoffDateTime)) {
          throw new BadRequestException(
            `Cannot ${actionLabel} ${pickDropLabel} request. ${windowLabel} ` +
              `(${cutoffDateTime.format(
                'hh:mm A',
              )}, same day) has already passed.`,
          );
        }
        return;
      }

      throw new BadRequestException(
        `Invalid daily cutoff type '${cutoffType}' for ${pickDropLabel} ${actionLabel}.`,
      );
    }

    throw new BadRequestException(
      `Invalid cutoff mode '${mode}' for ${pickDropLabel} ${actionLabel}.`,
    );
  }

  async editBatchTripRequest(
    editTripRequestInput: CreateTripRequestInput,
    user?: any,
  ): Promise<GenericResponse<TripRequest>> {
    const transaction = await this.tripRequestModel.sequelize.transaction();
    try {
      const organizationID = editTripRequestInput.selectedOrgID ?? user?.orgID;
      const { selectedDates, loginTime, logoutTime, status, employeeCodes } =
        editTripRequestInput;

      const approvalType = await this.configService.getConfigValue(
        'AUTO_APPROVAL_TRIP_REQUEST',
        user?.orgID,
      );
      const updatedStatus = approvalType === 'Yes' ? Status.Approved : status;

      const employees = await this.employeeModel.findAll({
        where: {
          employeeCode: { [Op.in]: employeeCodes },
          orgID: user?.orgID,
          status: Status.Active,
        },
        include: [
          { model: Location, as: 'location', attributes: ['id', 'name'] },
        ],
        transaction,
      });

      const validEmployeeCodes = new Set(
        employees.map((emp) => emp.employeeCode),
      );
      const invalidEmployeeCodes = employeeCodes.filter(
        (code) => !validEmployeeCodes.has(code),
      );
      if (invalidEmployeeCodes.length > 0) {
        const chunkSize = 5;
        const formattedList = invalidEmployeeCodes
          .reduce((acc, code, i) => {
            const chunkIndex = Math.floor(i / chunkSize);
            acc[chunkIndex] = acc[chunkIndex] || [];
            acc[chunkIndex].push(code);
            return acc;
          }, [] as string[][])
          .map((group) => group.join(', '))
          .join('\n');
        throw new BadRequestException(
          `Invalid Employee Codes found:\n${formattedList}`,
        );
      }

      const configResponse = await this.configService.getMultipleConfigValues(
        ['PICKUP_SCHEDULE_CUTOFF', 'DROP_SCHEDULE_CUTOFF'],
        { orgID: organizationID },
      );
      const {
        PICKUP_SCHEDULE_CUTOFF: pickupCutoffConfig,
        DROP_SCHEDULE_CUTOFF: dropCutoffConfig,
      } = configResponse?.data || {};

      if (!pickupCutoffConfig && loginTime) {
        throw new BadRequestException('Pickup cutoff configuration not set');
      }
      if (!dropCutoffConfig && logoutTime) {
        throw new BadRequestException('Drop cutoff configuration not set');
      }

      for (const date of selectedDates) {
        if (moment(date).isBefore(moment(), 'day')) {
          throw new BadRequestException(
            `Trip date ${moment(date).format(
              'DD/MM/YYYY',
            )} cannot be in the past`,
          );
        }
      }

      if (loginTime) {
        await this.applyCutoffValidation(
          pickupCutoffConfig,
          selectedDates,
          loginTime,
          'login',
          user,
        );
      }
      if (logoutTime) {
        await this.applyCutoffValidation(
          dropCutoffConfig,
          selectedDates,
          logoutTime,
          'logout',
          user,
        );
      }

      // Build every (employeeCode, date, pickDrop) slot this edit will touch —
      // same cross-day logic as batch-trip-request-new so a same-day vs next-day
      // dropoff resolves to the exact date the existing record would live on.
      const targetSlots: { date: string; pickDrop: boolean }[] = [];
      for (const date of selectedDates) {
        if (loginTime) {
          targetSlots.push({
            date: moment(date).format('YYYY-MM-DD'),
            pickDrop: true,
          });
        }
        if (logoutTime) {
          let logoutDate = moment(date).format('YYYY-MM-DD');
          if (loginTime && logoutTime) {
            const [pickupHour, pickupMin] = loginTime.split(':').map(Number);
            const [dropoffHour, dropoffMin] = logoutTime.split(':').map(Number);
            const pickupMinutes = pickupHour * 60 + pickupMin;
            const dropoffMinutes = dropoffHour * 60 + dropoffMin;
            if (pickupMinutes > dropoffMinutes) {
              const nextDay = new Date(date);
              nextDay.setDate(nextDay.getDate() + 1);
              logoutDate = nextDay.toISOString().split('T')[0];
            }
          }
          targetSlots.push({ date: logoutDate, pickDrop: false });
        }
      }

      // 1) Find existing active requests occupying those slots for these employees
      const existingTrips = await this.tripRequestModel.findAll({
        where: {
          employeeCode: { [Op.in]: employeeCodes },
          orgID: user?.orgID,
          status: { [Op.in]: [Status.Approved, Status.Requested] },
          [Op.or]: targetSlots.map(({ date, pickDrop }) => ({
            date,
            pickDrop,
          })),
        },
        transaction,
      });

      // 2) Validate that none of the existing requests belong to a locked trip
      if (existingTrips.length > 0) {
        const lockedRequests: typeof existingTrips = [];

        for (const request of existingTrips) {
          if (request.tripID) {
            const trip = await this.tripModel.findOne({
              where: { id: request.tripID },
              transaction,
            });
            if (!trip) continue;

            if (trip.lockStatus === Status.Active) {
              lockedRequests.push(request);
            }
          }
        }

        if (lockedRequests.length > 0) {
          const lockedDetails = lockedRequests
            .map(
              (req) =>
                `Employee Code: ${req.employeeCode}, Date: ${moment(
                  req.date,
                ).format('DD/MM/yyyy')}, Shift Time: ${req.shiftTime}`,
            )
            .join('; ');

          throw new BadRequestException(
            `Trip request belongs to a locked trip, cannot be updated : ${lockedDetails}`,
          );
        }

        // 3) Reject existing requests only after all lock checks pass
        const existingIds = existingTrips.map((t) => t.id);

        await this.tripRequestModel.update(
          { status: Status.Rejected },
          {
            where: { id: { [Op.in]: existingIds } },
            transaction,
          },
        );

        const rejectLogs = existingTrips.map((trip) => ({
          objectType: 'Trip Request',
          changeType: 'edit-reject',
          objectID: trip?.id,
          authID: user?.id,
          orgID: user?.orgID,
          updatedBy: user?.name,
          payload: JSON.parse(JSON.stringify(trip)),
          requestPayload: {
            status: Status.Rejected,
            reason: 'Superseded by edit',
          },
          // 'edit-reject' has no matching case in generateDescription()'s
          // switch, which would otherwise leave description blank.
          customDescription: 'rejected Trip Request (superseded by edit)',
          user,
        }));
        await this.eventlogService.bulkCreate(rejectLogs);
      }

      // 3) Create fresh trip requests for every target slot
      const tripRequests = employees.flatMap((employee) =>
        selectedDates.flatMap((date) => {
          const tripRecords = [];

          if (loginTime) {
            tripRecords.push({
              ...editTripRequestInput,
              employeeID: employee.id,
              employeeCode: employee.employeeCode,
              orgID: employee.orgID,
              teamID: employee.teamID,
              processID: employee.processID,
              locationID: employee.locationID,
              geoCode: employee.homePoint,
              locationName: employee.location?.name,
              date: moment(date).format('YYYY-MM-DD'),
              shiftTime: normalizeTime(loginTime),
              pickDrop: true,
              status: updatedStatus ?? Status.Active,
              attendanceOtp: generateOTP(),
              emergencyType: 'Manual Update',
            });
          }

          if (logoutTime) {
            let logoutDate = moment(date).format('YYYY-MM-DD');
            if (loginTime && logoutTime) {
              const [pickupHour, pickupMin] = loginTime.split(':').map(Number);
              const [dropoffHour, dropoffMin] = logoutTime
                .split(':')
                .map(Number);
              const pickupMinutes = pickupHour * 60 + pickupMin;
              const dropoffMinutes = dropoffHour * 60 + dropoffMin;
              if (pickupMinutes > dropoffMinutes) {
                const nextDay = new Date(date);
                nextDay.setDate(nextDay.getDate() + 1);
                logoutDate = nextDay.toISOString().split('T')[0];
              }
            }
            tripRecords.push({
              ...editTripRequestInput,
              employeeID: employee.id,
              employeeCode: employee.employeeCode,
              orgID: employee.orgID,
              teamID: employee.teamID,
              processID: employee.processID,
              locationID: employee.locationID,
              locationName: employee.location?.name,
              date: logoutDate,
              shiftTime: normalizeTime(logoutTime),
              pickDrop: false,
              geoCode: employee.homePoint,
              status: updatedStatus ?? Status.Active,
              emergencyType: 'Manual Update',
              attendanceOtp: generateOTP(),
            });
          }

          return tripRecords;
        }),
      );

      const trips = await this.tripRequestModel.bulkCreate(tripRequests, {
        transaction,
      });

      const eventPayload = JSON.parse(JSON.stringify(tripRequests));
      const createLogs = trips.map((trip, index) => ({
        objectType: 'Trip Request',
        // Lowercased/underscored to match the existing convention used
        // elsewhere (bulkAssignCabAndDriver in trip.service.ts), rather
        // than the inconsistent 'Bulk edit'.
        changeType: 'bulk_edit',
        objectID: trip?.id,
        authID: user?.id,
        orgID: user?.orgID,
        updatedBy: user?.name,
        payload: { date: trip.date, shiftTime: trip.shiftTime },
        requestPayload: eventPayload[index],
        // Neither 'Bulk edit' nor 'bulk_edit' has a matching case in
        // generateDescription()'s switch, so this needs a customDescription
        // the same way bulkAssignCabAndDriver's does.
        customDescription: `created ${trips.length} Trip Request(s) via bulk edit`,
        user,
      }));
      await this.eventlogService.bulkCreate(createLogs);

      await transaction.commit();

      return {
        message: `${trips.length} trip request(s) updated successfully.`,
        data: trips[0],
      };
    } catch (error) {
      await transaction.rollback();
      if (error.status !== 500) {
        this.eventlogService.create({
          objectType: 'Trip Request',
          changeType: 'bulk-edit-failed',
          objectID: null,
          authID: user?.id,
          orgID: editTripRequestInput.selectedOrgID ?? user?.orgID,
          updatedBy: user?.name,
          payload: {
            employeeCodes: editTripRequestInput.employeeCodes,
            selectedDates: editTripRequestInput.selectedDates,
            loginTime: editTripRequestInput.loginTime,
            logoutTime: editTripRequestInput.logoutTime,
          },
          requestPayload: editTripRequestInput,
          customDescription: `attempted to bulk-edit Trip Request(s) - ${error.message}`,
          user,
        });
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async updateStatus(ids: string[], status: string, user?: any): Promise<any> {
    // const transaction = await this.sequelize.transaction();
    try {
      const updateStatus =
        status === 'Approve'
          ? Status.Approved
          : status === 'Reject'
          ? Status.Rejected
          : status === 'Cancel'
          ? Status.Cancelled
          : status;
      const requests = await this.tripRequestModel.findAll({
        where: { id: { [Op.in]: ids } },
      });
      // Captured before any status mutation below, so the event log (in
      // either branch) shows each request's real prior status rather than
      // relying on Sequelize instance mutation semantics after req.update()
      // runs later in the loop.
      const previousStatusMap = new Map(
        requests.map((req) => [String(req.id), req.status]),
      );
      // One bulk lookup for every employee touched by this batch — trip
      // requests only carry employeeCode, not the name, so this is
      // needed purely to label the diff rows readably (Name - Code)
      // instead of just the code.
      const employeeIDs = [
        ...new Set(requests.map((req) => String(req.employeeID))),
      ];
      const employeesForLog = await this.employeeModel.findAll({
        where: { id: { [Op.in]: employeeIDs } },
        attributes: ['id', 'name'],
      });
      const employeeNameMap = new Map(
        employeesForLog.map((emp) => [String(emp.id), emp.name]),
      );
      const buildStatusChangeLog = (finalStatus: string) => {
        const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
        const payloadSummary = requests.map((req) => ({
          tripRequestID: String(req.id),
          employeeCode: req.employeeCode,
          employeeName: employeeNameMap.get(String(req.employeeID)) ?? null,
          date: req.date,
          shiftTime: req.shiftTime,
          previousStatus: previousStatusMap.get(String(req.id)) ?? null,
          newStatus: finalStatus,
        }));
        for (const req of requests) {
          const employeeName = employeeNameMap.get(String(req.employeeID));
          const employeeLabel = employeeName
            ? `${employeeName} - ${req.employeeCode}`
            : req.employeeCode;
          changeJSON[`Trip Request ${req.id} (${employeeLabel}) - Status`] = {
            OldValue: previousStatusMap.get(String(req.id)) ?? null,
            newValue: finalStatus,
          };
        }
        return { changeJSON, payloadSummary };
      };
      if (updateStatus === Status.Rejected) {
        for (const req of requests) {
          if (req.tripID) {
            const trip = await this.tripModel.findOne({
              where: { id: req.tripID },
            });
            if (!trip) continue;
            if (trip.lockStatus === Status.Active) {
              throw new BadRequestException(
                `Trip request belongs to a locked trip, cannot be rejected. Employee Code: ${
                  req.employeeCode
                }, Date: ${moment(req.date).format(
                  'DD/MM/yyyy',
                )}, Shift Time: ${req.shiftTime}`,
              );
            }
            const updatedEmployees = (trip.employees || []).filter(
              (emp) => Number(emp.tripRequestID) !== Number(req.id),
            );
            const tripRequestsCount = await this.tripRequestModel.count({
              where: { tripID: trip.id, status: { [Op.ne]: Status.Rejected } },
            });
            if (tripRequestsCount <= 1) {
              await trip.update({
                status: TripStatus.Cancelled,
                employees: [],
              });
            } else {
              await trip.update({ employees: updatedEmployees });
              const configResponse =
                await this.configService.getMultipleConfigValues(
                  ['Night shift start time', 'Night shift end time'],
                  { orgID: trip.orgID },
                );
              const {
                'Night shift start time': startTime,
                'Night shift end time': endTime,
              } = configResponse?.data || {};
              const toMinutes = (time: string) => {
                const [h, m] = time.split(':').map(Number);
                return h * 60 + m;
              };
              const shiftMinutes = toMinutes(trip.shiftTime);
              const startMinutes = toMinutes(startTime);
              const endMinutes = toMinutes(endTime);
              let isNightShift = false;
              if (startMinutes < endMinutes) {
                isNightShift =
                  shiftMinutes >= startMinutes && shiftMinutes <= endMinutes;
              } else {
                isNightShift =
                  shiftMinutes >= startMinutes || shiftMinutes <= endMinutes;
              }
              if (isNightShift && updatedEmployees.length > 0) {
                if (trip.pickDrop.toLowerCase() === 'pick') {
                  const firstEmployee = updatedEmployees[0];
                  if (firstEmployee.gender.toLowerCase() === 'male') {
                    if (trip.spock) {
                      await trip.update({
                        spockID: null,
                        spock: false,
                        spockCode: null,
                      });
                    }
                  } else {
                    if (!trip.spock) {
                      await this.assignAvailableSpoc(trip.id);
                    }
                  }
                } else if (trip.pickDrop.toLowerCase() === 'drop') {
                  const lastEmployee =
                    updatedEmployees[updatedEmployees.length - 1];
                  if (lastEmployee.gender.toLowerCase() === 'male') {
                    if (trip.spock) {
                      await trip.update({
                        spockID: null,
                        spock: false,
                        spockCode: null,
                      });
                    }
                  } else {
                    if (!trip.spock) {
                      await this.assignAvailableSpoc(trip.id);
                    }
                  }
                }
              }
            }
            await req.update({ tripID: null, status: Status.Rejected }); // cancelled
          } else {
            await req.update({ status: Status.Rejected });
          }
        }
        // await transaction.commit();
        const { changeJSON, payloadSummary } = buildStatusChangeLog(
          Status.Rejected,
        );
        this.eventlogService.create({
          objectType: 'Trip Request',
          changeType: 'bulk_edit',
          objectID: ids.length === 1 ? ids[0] : null,
          authID: user?.id,
          orgID: user?.orgID,
          updatedBy: user?.name,
          payload: payloadSummary,
          requestPayload: { ids, status },
          changeJSON,
          customDescription: `Bulk Trip Request rejection for ${ids.length} trip request(s)`,
          user,
        });
        return { message: 'Trip requests rejected successfully' };
      }
      if (updateStatus === Status.Cancelled) {
        for (const req of requests) {
          if (req.tripID) {
            const trip = await this.tripModel.findOne({
              where: { id: req.tripID },
            });
            if (!trip) continue;
            if (trip.lockStatus === Status.Active) {
              throw new BadRequestException(
                `Trip request belongs to a locked trip, cannot be cancelled. Employee Code: ${
                  req.employeeCode
                }, Date: ${moment(req.date).format(
                  'DD/MM/yyyy',
                )}, Shift Time: ${req.shiftTime}`,
              );
            }
            const updatedEmployees = (trip.employees || []).filter(
              (emp) => Number(emp.tripRequestID) !== Number(req.id),
            );
            if (updatedEmployees.length === 0) {
              await trip.update({
                status: TripStatus.Cancelled,
                employees: [],
              });
            } else {
              await trip.update({ employees: updatedEmployees });
              const configResponse =
                await this.configService.getMultipleConfigValues(
                  ['Night shift start time', 'Night shift end time'],
                  { orgID: trip.orgID },
                );
              const {
                'Night shift start time': startTime,
                'Night shift end time': endTime,
              } = configResponse?.data || {};
              const toMinutes = (time: string) => {
                const [h, m] = time.split(':').map(Number);
                return h * 60 + m;
              };
              const shiftMinutes = toMinutes(trip.shiftTime);
              const startMinutes = toMinutes(startTime);
              const endMinutes = toMinutes(endTime);
              let isNightShift = false;
              if (startMinutes < endMinutes) {
                isNightShift =
                  shiftMinutes >= startMinutes && shiftMinutes <= endMinutes;
              } else {
                isNightShift =
                  shiftMinutes >= startMinutes || shiftMinutes <= endMinutes;
              }
              if (isNightShift && updatedEmployees.length > 0) {
                if (trip.pickDrop.toLowerCase() === 'pick') {
                  const firstEmployee = updatedEmployees[0];
                  if (firstEmployee.gender.toLowerCase() === 'male') {
                    if (trip.spock) {
                      await trip.update({
                        spockID: null,
                        spock: false,
                        spockCode: null,
                      });
                    }
                  } else {
                    if (!trip.spock) {
                      await this.assignAvailableSpoc(trip.id);
                    }
                  }
                } else if (trip.pickDrop.toLowerCase() === 'drop') {
                  const lastEmployee =
                    updatedEmployees[updatedEmployees.length - 1];
                  if (lastEmployee.gender.toLowerCase() === 'male') {
                    if (trip.spock) {
                      await trip.update({
                        spockID: null,
                        spock: false,
                        spockCode: null,
                      });
                    }
                  } else {
                    if (!trip.spock) {
                      await this.assignAvailableSpoc(trip.id);
                    }
                  }
                }
              }
            }
            await req.update({ tripID: null, status: Status.Cancelled });
          } else {
            await req.update({ status: Status.Cancelled });
          }
        }
      }
      // 🔹 Default case (Approve or other statuses) — also the fall-through
      // for the Cancelled branch above, since it doesn't return early.
      const updatedTrips = await this.tripRequestModel.update(
        { status: updateStatus },
        {
          where: { id: { [Op.in]: ids } },
          returning: true,
        },
      );
      // await transaction.commit();
      const actionVerb =
        updateStatus === Status.Approved
          ? 'approval'
          : updateStatus === Status.Cancelled
          ? 'cancellation'
          : `status update to "${updateStatus}"`;
      const { changeJSON, payloadSummary } = buildStatusChangeLog(updateStatus);
      this.eventlogService.create({
        objectType: 'Trip Request',
        changeType: 'bulk_edit',
        objectID: ids.length === 1 ? ids[0] : null,
        authID: user?.id,
        orgID: user?.orgID,
        updatedBy: user?.name,
        payload: payloadSummary,
        requestPayload: { ids, status },
        changeJSON,
        customDescription: `Bulk Trip Request ${actionVerb} for ${ids.length} trip request(s)`,
        user,
      });
      return {
        message: 'Trip requests updated successfully',
        data: updatedTrips?.[1] ?? [],
      };
    } catch (error) {
      // await transaction.rollback();
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  //This updateTripRequestStatus service is for employee portal, to cancel their trip request. Admin cancellation should go through updateStatus with Cancelled status.
  //This service only for employee login : delete status update.
  async updateTripRequestStatus(
    ids: string[],
    status: string,
    user?: any,
    skipEventLog?: boolean,
  ): Promise<any> {
    try {
      const updateStatus =
        status === 'Approve'
          ? Status.Approved
          : status === 'Reject'
          ? Status.Rejected
          : status === 'Cancel'
          ? Status.Cancelled
          : status;

      const requests = await this.tripRequestModel.findAll({
        where: { id: { [Op.in]: ids } },
      });

      const previousStatusMap = new Map(
        requests.map((req) => [String(req.id), req.status]),
      );

      const buildStatusChangeLog = (finalStatus: string) => {
        const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
        const payloadSummary = requests.map((req) => ({
          tripRequestID: String(req.id),
          employeeCode: req.employeeCode,
          date: req.date,
          shiftTime: req.shiftTime,
          previousStatus: previousStatusMap.get(String(req.id)) ?? null,
          newStatus: finalStatus,
        }));
        for (const req of requests) {
          changeJSON[`Trip Request ${req.id} (${req.employeeCode}) - Status`] =
            {
              OldValue: previousStatusMap.get(String(req.id)) ?? null,
              newValue: finalStatus,
            };
        }
        return { changeJSON, payloadSummary };
      };

      if (updateStatus === Status.Rejected) {
        for (const req of requests) {
          if (req.tripID) {
            const trip = await this.tripModel.findOne({
              where: { id: req.tripID },
            });
            if (!trip) continue;

            if (trip.lockStatus === Status.Active) {
              throw new BadRequestException(
                `Trip request belongs to a locked trip, cannot be rejected.`,
              );
            }

            const updatedEmployees = (trip.employees || []).filter(
              (emp) => Number(emp.tripRequestID) !== Number(req.id),
            );

            const tripRequestsCount = await this.tripRequestModel.count({
              where: { tripID: trip.id, status: { [Op.ne]: Status.Rejected } },
            });

            if (tripRequestsCount <= 1) {
              await trip.update({
                status: TripStatus.Cancelled,
                employees: [],
              });
            } else {
              await trip.update({ employees: updatedEmployees });

              const configResponse =
                await this.configService.getMultipleConfigValues(
                  ['Night shift start time', 'Night shift end time'],
                  { orgID: trip.orgID },
                );
              const {
                'Night shift start time': startTime,
                'Night shift end time': endTime,
              } = configResponse?.data || {};

              const toMinutes = (time: string) => {
                const [h, m] = time.split(':').map(Number);
                return h * 60 + m;
              };

              const shiftMinutes = toMinutes(trip.shiftTime);
              const startMinutes = toMinutes(startTime);
              const endMinutes = toMinutes(endTime);

              let isNightShift = false;
              if (startMinutes < endMinutes) {
                isNightShift =
                  shiftMinutes >= startMinutes && shiftMinutes <= endMinutes;
              } else {
                isNightShift =
                  shiftMinutes >= startMinutes || shiftMinutes <= endMinutes;
              }
              if (isNightShift && updatedEmployees.length > 0) {
                if (trip.pickDrop.toLowerCase() === 'pick') {
                  const firstEmployee = updatedEmployees[0];
                  if (firstEmployee.gender.toLowerCase() === 'male') {
                    if (trip.spock) {
                      await trip.update({
                        spockID: null,
                        spock: false,
                        spockCode: null,
                      });
                    }
                  } else {
                    if (!trip.spock) {
                      await this.assignAvailableSpoc(trip.id);
                    }
                  }
                } else if (trip.pickDrop.toLowerCase() === 'drop') {
                  const lastEmployee =
                    updatedEmployees[updatedEmployees.length - 1];
                  if (lastEmployee.gender.toLowerCase() === 'male') {
                    if (trip.spock) {
                      await trip.update({
                        spockID: null,
                        spock: false,
                        spockCode: null,
                      });
                    }
                  } else {
                    if (!trip.spock) {
                      await this.assignAvailableSpoc(trip.id);
                    }
                  }
                }
              }
            }
            await req.update({ tripID: null, status: Status.Rejected }); // cancelled
          } else {
            await req.update({ status: Status.Rejected });
          }
        }

        if (!skipEventLog) {
          const { changeJSON, payloadSummary } = buildStatusChangeLog(
            Status.Rejected,
          );
          this.eventlogService.create({
            objectType: 'Trip Request',
            changeType: 'bulk_edit',
            objectID: ids.length === 1 ? ids[0] : null,
            authID: user?.id,
            orgID: user?.orgID,
            updatedBy: user?.name,
            payload: payloadSummary,
            requestPayload: { ids, status },
            changeJSON,
            customDescription: `Bulk Trip Request rejection for ${ids.length} trip request(s)`,
            user,
          });
        }

        return { message: 'Trip requests rejected successfully' };
      }

      if (updateStatus === Status.Cancelled) {
        for (const req of requests) {
          const employee = await this.employeeService.findOne(req.employeeID);
          if (!employee) {
            throw new BadRequestException('Employee not found.');
          }

          const { pickupConfig, dropConfig } =
            await this.resolveTeamCutoffConfig(
              employee,
              req.orgID,
              'CANCEL',
              'PICKUP_DELETE_CUTOFF',
              'DROP_DELETE_CUTOFF',
            );

          if (req.pickDrop === true) {
            this.validateEditCancelCutoff(
              pickupConfig,
              req.shiftTime,
              req.date,
              'cancel',
              'pick',
            );
          } else if (req.pickDrop === false) {
            this.validateEditCancelCutoff(
              dropConfig,
              req.shiftTime,
              req.date,
              'cancel',
              'drop',
            );
          }

          if (req.tripID) {
            const trip = await this.tripModel.findOne({
              where: { id: req.tripID },
            });
            if (!trip) continue;

            if (trip.status === TripStatus.Completed) {
              throw new BadRequestException(
                'Trip request cannot be cancelled because the trip is already completed.',
              );
            }

            const updatedEmployees = (trip.employees || []).filter(
              (emp) => Number(emp.tripRequestID) !== Number(req.id),
            );

            if (updatedEmployees.length === 0) {
              await trip.update({
                status: TripStatus.Cancelled,
                employees: [],
              });
            } else {
              await trip.update({ employees: updatedEmployees });

              const configResponse =
                await this.configService.getMultipleConfigValues(
                  ['Night shift start time', 'Night shift end time'],
                  { orgID: trip.orgID },
                );
              const {
                'Night shift start time': startTime,
                'Night shift end time': endTime,
              } = configResponse?.data || {};

              const toMinutes = (time: string) => {
                const [h, m] = time.split(':').map(Number);
                return h * 60 + m;
              };

              const shiftMinutes = toMinutes(trip.shiftTime);
              const startMinutes = toMinutes(startTime);
              const endMinutes = toMinutes(endTime);

              let isNightShift = false;
              if (startMinutes < endMinutes) {
                isNightShift =
                  shiftMinutes >= startMinutes && shiftMinutes <= endMinutes;
              } else {
                isNightShift =
                  shiftMinutes >= startMinutes || shiftMinutes <= endMinutes;
              }

              if (isNightShift && updatedEmployees.length > 0) {
                if (trip.pickDrop.toLowerCase() === 'pick') {
                  const firstEmployee = updatedEmployees[0];
                  if (firstEmployee.gender.toLowerCase() === 'male') {
                    if (trip.spock) {
                      await trip.update({
                        spockID: null,
                        spock: false,
                        spockCode: null,
                      });
                    }
                  } else {
                    if (!trip.spock) {
                      await this.assignAvailableSpoc(trip.id);
                    }
                  }
                } else if (trip.pickDrop.toLowerCase() === 'drop') {
                  const lastEmployee =
                    updatedEmployees[updatedEmployees.length - 1];
                  if (lastEmployee.gender.toLowerCase() === 'male') {
                    if (trip.spock) {
                      await trip.update({
                        spockID: null,
                        spock: false,
                        spockCode: null,
                      });
                    }
                  } else {
                    if (!trip.spock) {
                      await this.assignAvailableSpoc(trip.id);
                    }
                  }
                }
              }
            }
            await req.update({ tripID: null, status: Status.Cancelled });
          } else {
            await req.update({ status: Status.Cancelled });
          }
        }
      }

      // 🔹 Default case (Approve or other statuses) — also the fall-through
      // for the Cancelled branch above, since it doesn't return early.
      const updatedTrips = await this.tripRequestModel.update(
        { status: updateStatus },
        {
          where: { id: { [Op.in]: ids } },
          returning: true,
        },
      );

      const actionVerb =
        updateStatus === Status.Approved
          ? 'approval'
          : updateStatus === Status.Cancelled
          ? 'cancellation'
          : `status update to "${updateStatus}"`;
      if (!skipEventLog) {
        const { changeJSON, payloadSummary } =
          buildStatusChangeLog(updateStatus);
        this.eventlogService.create({
          objectType: 'Trip Request',
          changeType: 'bulk_edit',
          objectID: ids.length === 1 ? ids[0] : null,
          authID: user?.id,
          orgID: user?.orgID,
          updatedBy: user?.name,
          payload: payloadSummary,
          requestPayload: { ids, status },
          changeJSON,
          customDescription: `Bulk Trip Request ${actionVerb} for ${ids.length} trip request(s)`,
          user,
        });
      }

      return {
        message: 'Trip requests updated successfully',
        data: updatedTrips?.[1] ?? [],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async rateTrip(
    tripInput: RateTripDto,
    user: any,
  ): Promise<GenericResponse<any>> {
    const { tripID, ratings, comments } = tripInput;
    const trip = await this.tripModel.findOne({
      where: { id: tripID },
    });

    if (!trip) {
      throw new BadRequestException('Trip not found');
    }
    const tripRequest = await this.tripRequestModel.findOne({
      where: {
        tripID,
        employeeID: user.employeeID,
      },
    });

    if (!tripRequest) {
      throw new BadRequestException('Employee is not assigned to this trip');
    }
    if (trip.status !== TripStatus.Completed) {
      throw new BadRequestException(
        'Trip is not completed yet. Rating is allowed only after trip completion',
      );
    }
    if (tripRequest.ratings) {
      throw new BadRequestException('Trip is already rated by this employee');
    }
    tripRequest.ratings = ratings;
    tripRequest.comments = comments ?? null;

    await tripRequest.save();
    await this.eventlogService.create({
      objectType: 'Trip Request',
      changeType: 'edit',
      objectID: tripRequest.id,
      authID: user.id,
      updatedBy: user.name,
      payload: tripInput,
      requestPayload: tripRequest,
      user,
    });

    return {
      message: 'Trip rated successfully',
      data: {
        tripRequest,
      },
    };
  }

  async updateTripID(ids: string[], user: any): Promise<any> {
    try {
      const requestById = await this.tripRequestModel.update(
        { tripID: null },
        {
          where: {
            id: { [Op.in]: ids },
          },
        },
      );
      const eventPayload = JSON.parse(JSON.stringify(requestById));
      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: null,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: requestById,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Trip requests updated successfully',
        data: requestById?.[0] ?? [1],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async markNoShow(
    tripRequestIDs: string[],
    user: any,
  ): Promise<GenericResponse<null>> {
    try {
      // const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');

      // Update all trip requests to mark noShow = true
      const [affectedCount] = await this.tripRequestModel.update(
        {
          noShow: true,
          attendance: false, // Reset attendance if it was marked
          attendanceTime: null,
          attendanceMode: null,
        },
        {
          where: {
            id: { [Op.in]: tripRequestIDs },
            status: { [Op.ne]: Status.EmployeeSelfNoShow },
          },
          returning: true,
        },
      );
      if (affectedCount === 0) {
        throw new BadRequestException('Failed to mark no show');
      }

      // *** NEW: Update Trip model's employees arrays for each trip request ***
      for (const tripRequestID of tripRequestIDs) {
        const tripRequest = await this.tripRequestModel.findByPk(tripRequestID);
        // Skip if this one was excluded by the guard (still self-cancelled)
        if (tripRequest?.status === Status.EmployeeSelfNoShow) {
          continue; //  don't mirror stale state into Trip.employees
        }

        if (tripRequest && tripRequest.tripID) {
          // Find the trip that contains this employee - convert bigint to number
          const trip = await this.tripService.findOne(
            Number(tripRequest.tripID),
          );

          if (trip && trip.employees) {
            // Update the specific employee in the employees array
            const updatedEmployees = trip.employees.map((emp) => {
              if (emp.id === tripRequest.employeeID.toString()) {
                return {
                  ...emp,
                  noShow: true,
                  attendance: false,
                  attendanceTime: null,
                  attendanceMode: null,
                };
              }
              return emp;
            });

            // Update the Trip model with the updated employees array - convert bigint to string for updateEmployeesArray
            await this.tripService.updateEmployeesArray(
              tripRequest.tripID.toString(),
              updatedEmployees,
            );
          }
        }
      }

      // Create event logs — curated payload matching markAttendance's shape:
      // tripRequestID, tripID, employeeCode (a direct column on TripRequest,
      // no join needed) — instead of the bare { noShow: true } that was
      // producing a stray auto-diff fallback (Image 1: Id 208975 → 4686).
      for (const tripRequestID of tripRequestIDs) {
        const updatedTripRequest = await this.tripRequestModel.findByPk(
          tripRequestID,
        );

        const eventLog = {
          objectType: 'Trip Request',
          changeType: 'edit',
          objectID: tripRequestID,
          authID: user.id,
          updatedBy: user.name,
          payload: {
            tripRequestID: updatedTripRequest?.id,
            tripID: updatedTripRequest?.tripID,
            employeeCode: updatedTripRequest?.employeeCode,
            noShow: true,
          },
          requestPayload: { tripRequestID },
          customDescription: 'marked as no show',
          user,
        };
        await this.eventlogService.create(eventLog);
      }

      return {
        message: `${affectedCount} employee(s) marked as no show successfully`,
        data: null,
      };
    } catch (error) {
      this.logger.error('Error marking no show:', error);

      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to mark no show');
    }
  }

  async softDelete(id: string, user: any): Promise<GenericResponse<null>> {
    try {
      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'delete',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: '',
        requestPayload: id,
        user,
      };
      this.eventlogService.create(eventLog);
      await this.updateStatus([id], 'Cancelled');
      return {
        message: 'Trip request cancelled successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async softDeleteTripRequest(
  //   id: string,
  //   user: any,
  // ): Promise<GenericResponse<null>> {
  //   try {
  //     const eventLog = {
  //       objectType: 'Trip Request',
  //       changeType: 'delete',
  //       objectID: id,
  //       authID: user.id,
  //       orgID: user.orgID,
  //       updatedBy: user.name,
  //       payload: '',
  //       requestPayload: id,
  //     };
  //     this.eventlogService.create(eventLog);
  //     await this.updateTripRequestStatus([id], 'Cancelled');
  //     return {
  //       message: 'Trip request cancelled successfully',
  //       data: null,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  async softDeleteTripRequest(
    id: string,
    user: any,
  ): Promise<GenericResponse<null>> {
    // Hoisted above the try block so the catch block's failure log can
    // include the request's details even if updateTripRequestStatus() is
    // what throws — findOne()'s result is needed either way.
    let existingRequest: any;
    try {
      const requestById = await this.findOne(id, user);
      existingRequest = requestById.data;

      const employee = await this.employeeService.findOne(
        existingRequest.employeeID,
      );

      // Runs first — if this throws (locked trip, cutoff validation,
      // etc.), execution jumps to catch below and the 'delete' event log
      // further down is never written. Previously the log fired
      // unconditionally before this call, so a failed cancellation still
      // left behind a "removed Trip Request" row for an action that
      // never actually completed.
      await this.updateTripRequestStatus([id], 'Cancelled', user, true);

      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'delete',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        // Was payload: '' — a literal empty string, so expanding this row
        // in the UI showed nothing. Curated snapshot of what was deleted.
        payload: {
          tripRequestID: id,
          employeeCode: existingRequest?.employeeCode,
          date: existingRequest?.date,
          shiftTime: existingRequest?.shiftTime,
          statusAtDeletion: existingRequest?.status,
        },
        requestPayload: { id },
        user,
      };
      this.eventlogService.create(eventLog);

      if (employee) {
        this.sendShiftScheduleEmail(
          user?.orgID,
          'cancelled',
          employee?.data?.name,
          employee?.data?.employeeCode,
          existingRequest.date,
          existingRequest.shiftTime,
        );
      }

      return {
        message: 'Trip request cancelled successfully',
        data: null,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        // Fire-and-forget: record the rejection reason before re-throwing,
        // so a failed cancellation attempt (locked trip, cutoff exceeded,
        // etc.) leaves a trace instead of vanishing with the error
        // response. Scoped to error.status !== 500 — a genuine system
        // fault isn't a "business rejection" and shouldn't be logged as
        // one, matching the convention used for trip-request creation
        // failures elsewhere in this service.
        this.eventlogService.create({
          objectType: 'Trip Request',
          changeType: 'delete-failed',
          objectID: id,
          authID: user?.id,
          orgID: user?.orgID,
          updatedBy: user?.name,
          payload: {
            tripRequestID: id,
            employeeCode: existingRequest?.employeeCode,
            date: existingRequest?.date,
            shiftTime: existingRequest?.shiftTime,
            statusAtFailure: existingRequest?.status,
          },
          requestPayload: { id },
          customDescription: `attempted to cancel Trip Request - ${error.message}`,
          user,
        });
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  private normalizeDate(dateStr: string): string {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error(`Invalid date: ${dateStr}`);
    }

    const cleanDate = dateStr.trim();

    // Define common date formats to try in order of preference
    const formats = [
      'YYYY-MM-DD', // Already correct format
      'YYYY/MM/DD', // 2025/06/22
      'YYYY/DD/MM', // 2025/24/09 (year/day/month)
      'YYYY-DD-MM', // 2025-24-09 (year-day-month)
      'MM/DD/YYYY', // 06/22/2025
      'DD/MM/YYYY', // 22/06/2025
      'MM-DD-YYYY', // 06-22-2025
      'DD-MM-YYYY', // 22-06-2025
      'YYYY.MM.DD', // 2025.06.22
      'YYYY.DD.MM', // 2025.24.09
      'DD.MM.YYYY', // 22.06.2025
      'MMM DD, YYYY', // Jun 22, 2025
      'DD MMM YYYY', // 22 Jun 2025
      'YYYY-MMM-DD', // 2025-Jun-22
      'MMMM DD, YYYY', // June 22, 2025
      'DD MMMM YYYY', // 22 June 2025
      'MM/DD/YY', // 06/22/25
      'DD/MM/YY', // 22/06/25
      'YY/MM/DD', // 25/06/22
      'YY/DD/MM', // 25/24/09
      'MM-DD-YY', // 06-22-25
      'DD-MM-YY', // 22-06-25
      'YY-MM-DD', // 25-06-22
      'YY-DD-MM', // 25-24-09
    ];

    // Try each format with strict parsing
    for (const format of formats) {
      const parsed = moment(cleanDate, format, true);
      if (parsed.isValid()) {
        return parsed.format('YYYY-MM-DD');
      }
    }

    // Smart detection for ambiguous formats when strict parsing fails
    // Check if it looks like YYYY/DD/MM or YYYY-DD-MM format
    const yearFirstPattern = /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/;
    const yearFirstMatch = cleanDate.match(yearFirstPattern);

    if (yearFirstMatch) {
      const [, year, second, third] = yearFirstMatch;
      const secondNum = parseInt(second);
      const thirdNum = parseInt(third);

      // If second number > 12, it's likely day, so format is YYYY/DD/MM
      if (secondNum > 12 && thirdNum <= 12) {
        const testDate = moment(
          `${year}-${third.padStart(2, '0')}-${second.padStart(2, '0')}`,
          'YYYY-MM-DD',
          true,
        );
        if (testDate.isValid()) {
          return testDate.format('YYYY-MM-DD');
        }
      }

      // If third number > 12, it's likely day, so format is YYYY/MM/DD
      if (thirdNum > 12 && secondNum <= 12) {
        const testDate = moment(
          `${year}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`,
          'YYYY-MM-DD',
          true,
        );
        if (testDate.isValid()) {
          return testDate.format('YYYY-MM-DD');
        }
      }
    }

    // If none of the specific formats work, try moment's flexible parsing
    const flexibleParsed = moment(cleanDate);
    if (flexibleParsed.isValid()) {
      return flexibleParsed.format('YYYY-MM-DD');
    }

    throw new Error(`Unable to parse date format: ${cleanDate}`);
  }

  /**
   * Converts time format to HH:MM format
   */
  private normalizeTime(timeStr: string): string {
    if (!timeStr || typeof timeStr !== 'string') {
      return timeStr;
    }

    const cleanTime = timeStr.trim();

    // Common time formats
    const timeFormats = [
      'HH:mm', // 09:30
      'H:mm', // 9:30
      'HH:mm:ss', // 09:30:00
      'H:mm:ss', // 9:30:00
      'hh:mm A', // 09:30 AM
      'h:mm A', // 9:30 AM
      'HH.mm', // 09.30
      'H.mm', // 9.30
    ];

    // Try parsing with moment
    for (const format of timeFormats) {
      const parsed = moment(cleanTime, format, true);
      if (parsed.isValid()) {
        return parsed.format('HH:mm');
      }
    }

    // Fallback for basic time parsing
    const flexibleParsed = moment(cleanTime, 'HH:mm');
    if (flexibleParsed.isValid()) {
      return flexibleParsed.format('HH:mm');
    }

    // If all moment parsing fails, return original
    return cleanTime;
  }

  async importTripRequests(file: Buffer, user: any): Promise<object> {
    this.logger.log('import service---', file);

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
    });

    if (!sheetData.length) {
      throw new BadRequestException('The Excel file is empty.');
    }

    const headers = sheetData[0] as string[];
    const requiredHeaders = [
      'EmployeeCode',
      'TripDate',
      'LoginTime',
      'LogoutTime',
    ];

    const missingHeaders = requiredHeaders.filter(
      (header) => !headers.includes(header),
    );

    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `The Excel file is missing the following required headers: ${missingHeaders.join(
          ', ',
        )}.`,
      );
    }

    const sheetDataObjects = XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName],
      { raw: false },
    );

    if (!sheetDataObjects.length) {
      throw new BadRequestException(
        'The Excel file contains no valid data rows.',
      );
    }

    // Normalize ANY date/time format to your required format
    const normalizedData = sheetDataObjects.map((row: any, index: number) => {
      try {
        return {
          ...row,
          TripDate: row.TripDate
            ? this.normalizeDate(row.TripDate)
            : row.TripDate,
          LoginTime: row.LoginTime
            ? this.normalizeTime(row.LoginTime)
            : row.LoginTime,
          LogoutTime: row.LogoutTime
            ? this.normalizeTime(row.LogoutTime)
            : row.LogoutTime,
        };
      } catch (error) {
        throw new BadRequestException(`Row ${index + 2}: ${error.message}`);
      }
    });

    let validatedData;
    try {
      validatedData = await this.validateSheetData(normalizedData, user);
    } catch (error) {
      throw new BadRequestException(`Data validation failed: ${error.message}`);
    }

    const transaction = await this.sequelize.transaction();
    try {
      await this.tripRequestModel.bulkCreate(validatedData, { transaction });
      await transaction.commit();

      return {
        message: `${validatedData.length} trip requests were created successfully.`,
      };
    } catch (error) {
      await transaction.rollback();
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  private async validateSheetData(sheetData: any[], user: any): Promise<any[]> {
    const employeeCodes = sheetData.map((row) => row.EmployeeCode?.trim());
    const uniqueEmployeeCodes = [...new Set(employeeCodes)];

    const employees = await this.employeeModel.findAll({
      where: {
        employeeCode: {
          [Op.in]: uniqueEmployeeCodes,
        },
        orgID: user?.orgID,
        status: Status.Active,
      },
      include: [
        {
          model: Location,
          as: 'location',
          attributes: ['id', 'name'],
        },
      ],
    });

    const validEmployeeCodes = new Set(
      employees.map((emp) => emp.employeeCode),
    );
    const invalidEmployeeCodes = uniqueEmployeeCodes.filter(
      (code) => !validEmployeeCodes.has(code),
    );

    if (invalidEmployeeCodes.length > 0) {
      const invalidRows = sheetData
        .map((row, index) => ({
          row: index + 2,
          code: row.EmployeeCode,
        }))
        .filter((item) => invalidEmployeeCodes.includes(item.code?.trim()))
        .map((item) => `Row ${item.row}: '${item.code}'`)
        .join('\n');

      throw new BadRequestException(
        `The following rows contain invalid EmployeeCodes:\n${invalidRows}\n.`,
      );
    }
    const employeeMap = new Map();
    employees.forEach((emp) => employeeMap.set(emp.employeeCode, emp));
    const validatedData = await Promise.all(
      sheetData.map(async (row, index) => {
        const { EmployeeCode, TripDate, LoginTime, LogoutTime } = row;
        const trimmedCode = EmployeeCode.trim();
        const trimmedTripDate = TripDate?.trim();
        const trimmedLoginTime = LoginTime?.trim();
        const trimmedLogoutTime = LogoutTime?.trim();

        const employee = employeeMap.get(trimmedCode);
        if (!trimmedCode || !trimmedTripDate) {
          throw new BadRequestException(
            `Row ${
              index + 2
            } is missing required fields: 'EmployeeCode' and 'TripDate' are mandatory.`,
          );
        }

        if (!trimmedLoginTime && !trimmedLogoutTime) {
          throw new BadRequestException(
            `Row ${
              index + 2
            } must have at least one of 'LoginTime' or 'LogoutTime'.`,
          );
        }

        if (!/^[A-Za-z0-9]+$/.test(trimmedCode)) {
          throw new BadRequestException(
            `Invalid EmployeeCode format at row ${
              index + 2
            }. It should be alphanumeric.`,
          );
        }

        // if (!/^\d{4}-\d{2}-\d{2}$/.test(TripDate)) {
        //   throw new BadRequestException(
        //     `Invalid TripDate format at row ${
        //       index + 2
        //     }. It should be in 'YYYY-MM-DD' format.`,
        //   );
        // }

        const timeFormat = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (trimmedLoginTime && !timeFormat.test(trimmedLoginTime)) {
          throw new BadRequestException(
            `Invalid LoginTime format at row ${
              index + 2
            }. It should be in 'HH:MM' format.`,
          );
        }

        if (trimmedLogoutTime && !timeFormat.test(trimmedLogoutTime)) {
          throw new BadRequestException(
            `Invalid LogoutTime format at row ${
              index + 2
            }. It should be in 'HH:MM' format.`,
          );
        }

        const tripRecords = [];

        if (trimmedLoginTime) {
          const otp = generateOTP();
          tripRecords.push({
            employeeID: employee.id,
            orgID: employee.orgID,
            teamID: employee.teamID,
            processID: employee.processID,
            locationID: employee.locationID,
            locationName: employee.location?.name,
            employeeCode: trimmedCode,
            date: trimmedTripDate,
            shiftTime: normalizeTime(trimmedLoginTime),
            pickDrop: true,
            status: Status.Requested,
            attendanceOtp: otp,
          });
        }

        if (trimmedLogoutTime) {
          const loginHour = parseInt(trimmedLoginTime?.split(':')[0], 10) || 0;

          let logoutDate = trimmedTripDate;
          if (trimmedLoginTime && loginHour >= 19) {
            const nextDay = new Date(trimmedTripDate);
            nextDay.setDate(nextDay.getDate() + 1);
            logoutDate = nextDay.toISOString().split('T')[0];
          }
          const otp = generateOTP();
          tripRecords.push({
            employeeID: employee.id,
            orgID: employee.orgID,
            teamID: employee.teamID,
            processID: employee.processID,
            locationID: employee.locationID,
            locationName: employee.location?.name,
            employeeCode: trimmedCode,
            date: logoutDate,
            shiftTime: normalizeTime(trimmedLogoutTime),
            pickDrop: false,
            status: Status.Requested,
            attendanceOtp: otp,
          });
        }

        return tripRecords;
      }),
    );

    const allTripRecords = validatedData.flat();

    const existingRequests = await this.tripRequestModel.findAll({
      where: {
        [Op.and]: [
          {
            [Op.or]: allTripRecords.map((record) => ({
              employeeID: record.employeeID,
              date: record.date,
              shiftTime: record.shiftTime,
            })),
          },
          {
            status: {
              [Op.notIn]: [Status.Rejected, Status.Cancelled],
            },
          },
        ],
      },
    });

    if (existingRequests.length > 0) {
      const duplicateDetails = existingRequests
        .map(
          (req) =>
            `EmployeeCode: ${req.employeeCode}, Date: ${moment(req.date).format(
              'DD/MM/YYYY',
            )}, ShiftTime: ${req.shiftTime}`,
        )
        .join('\n');

      throw new BadRequestException(
        `Duplicate trip requests detected for the following entries: \n${duplicateDetails}.\nPlease correct and try again.`,
      );
    }

    return allTripRecords;
  }

  //  all errors in one shot
  // private async validateSheetData(sheetData: any[]): Promise<any[]> {
  //   const errors: string[] = []; // Store all errors here
  //   const validatedData = await Promise.all(
  //     sheetData.map(async (row, index) => {
  //       const { EmployeeCode, TripDate, LoginTime, LogoutTime } = row;
  //       const rowNumber = index + 2; // Excel rows start at 1 + header

  //       const employee = await this.employeeModel.findOne({
  //         where: { employeeCode: EmployeeCode },
  //         include: [
  //           {
  //             model: Location,
  //             as: 'location',
  //             attributes: ['id', 'name'],
  //           },
  //         ],
  //       });

  //       if (!employee) {
  //         errors.push(`Row ${rowNumber}: Invalid EmployeeCode '${EmployeeCode}'. Employee not found.`);
  //         return null;
  //       }

  //         if (!EmployeeCode || !TripDate) {
  //         errors.push(`Row ${rowNumber}: Missing required fields (EmployeeCode and TripDate).`);
  //         return null;
  //       }
  //         if (!LoginTime && !LogoutTime) {
  //         errors.push(`Row ${rowNumber}: At least one of 'LoginTime' or 'LogoutTime' is required.`);
  //         return null;
  //       }
  //         if (!/^[A-Za-z0-9]+$/.test(EmployeeCode)) {
  //         errors.push(`Row ${rowNumber}: EmployeeCode must be alphanumeric.`);
  //       }

  //       if (!/^\d{4}-\d{2}-\d{2}$/.test(TripDate)) {
  //         errors.push(`Row ${rowNumber}: TripDate must be in 'YYYY-MM-DD' format.`);
  //       }

  //       const timeFormat = /^([01]\d|2[0-3]):([0-5]\d)$/;
  //       if (LoginTime && !timeFormat.test(LoginTime)) {
  //         errors.push(`Row ${rowNumber}: LoginTime must be in 'HH:MM' format.`);
  //       }

  //       if (LogoutTime && !timeFormat.test(LogoutTime)) {
  //         errors.push(`Row ${rowNumber}: LogoutTime must be in 'HH:MM' format.`);
  //       }
  //         if (errors.some(e => e.startsWith(`Row ${rowNumber}:`))) {
  //         return null;
  //       }
  //         const tripRecords = [];
  //       if (LoginTime) {
  //         tripRecords.push({
  //           employeeID: employee.id,
  //           orgID: employee.orgID,
  //           teamID: employee.teamID,
  //           processID: employee.processID,
  //           locationID: employee.locationID,
  //           locationName: employee.location?.name,
  //           employeeCode: EmployeeCode.trim(),
  //           date: TripDate,
  //           shiftTime: LoginTime,
  //           pickDrop: true,
  //           status: Status.Requested,
  //         });
  //       }
  //       if (LogoutTime) {
  //         const loginHour = parseInt(LoginTime?.split(':')[0], 10);
  //         let logoutDate = TripDate;
  //         if (loginHour >= 19) {
  //           const nextDay = new Date(TripDate);
  //           nextDay.setDate(nextDay.getDate() + 1);
  //           logoutDate = nextDay.toISOString().split('T')[0];
  //         }
  //         tripRecords.push({
  //           employeeID: employee.id,
  //           orgID: employee.orgID,
  //           teamID: employee.teamID,
  //           processID: employee.processID,
  //           locationID: employee.locationID,
  //           locationName: employee.location?.name,
  //           employeeCode: EmployeeCode.trim(),
  //           date: logoutDate,
  //           shiftTime: LogoutTime,
  //           pickDrop: false,
  //           status: Status.Requested,
  //         });
  //       }

  //       return tripRecords;
  //     }),
  //   );
  //     if (errors.length > 0) {
  //     throw new BadRequestException(
  //       `The following errors were found:\n${errors.join('\n')}`,
  //     );
  //   }

  //   const allTripRecords = validatedData.flat().filter(Boolean);

  //   const existingRequests = await this.tripRequestModel.findAll({
  //     where: {
  //       [Op.or]: allTripRecords.map((record) => ({
  //         employeeID: record.employeeID,
  //         date: record.date,
  //         shiftTime: record.shiftTime,
  //       })),
  //     },
  //   });

  //   if (existingRequests.length > 0) {
  //     const duplicateDetails = existingRequests
  //       .map(
  //         (req) =>
  //           `EmployeeCode: ${req.employeeCode}, Date: ${req.date}, ShiftTime: ${req.shiftTime}`,
  //       )
  //       .join('\n');
  //     throw new BadRequestException(
  //       `Duplicate trip requests detected:\n${duplicateDetails}`,
  //     );
  //   }

  //   return allTripRecords;
  // }

  // Normalizes a query param into a clean string array, regardless of whether
  // the client sent a repeated key (?x=A&x=B), a comma-separated value (?x=A,B),
  // or a mix of both. Trims stray whitespace around each value.
  private normalizeToArray(value?: string | string[]): string[] | null {
    if (!value) return null;

    const raw = Array.isArray(value) ? value : [value];

    return raw
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  async findAllFutureTripRequests(
    user?: any,
    page?: number,
    limit?: number,
    tripRequestStatus?: string | string[],
    tripStatus?: string | string[],
  ): Promise<PaginatedList<TripRequest>> {
    try {
      let whereCondition: any;
      if (!whereCondition) {
        whereCondition = {};
      }

      if (user?.userType !== UserType.SuperAdmin) {
        if (user?.employeeID !== null) {
          const employee = await this.employeeService.findOne(user?.employeeID);

          if (employee?.data?.employeeType === EmployeeType.Employee) {
            if (user?.employeeID !== null)
              whereCondition.employeeID = user?.employeeID;
            whereCondition.orgID = user?.orgID;
          }
          if (employee?.data?.employeeType === EmployeeType.Admin) {
            whereCondition.orgID = user?.orgID;
          }
        } else {
          whereCondition.orgID = user?.orgID;
        }
      }

      const currentDate = new Date();
      const formattedDate = currentDate.toISOString().split('T')[0];

      const whereConditionDate = {
        [Op.and]: [
          Sequelize.where(fn('DATE', col('TripRequest.date')), {
            [Op.gte]: formattedDate,
          }),
        ],
      };

      const requestedTripRequestStatuses =
        this.normalizeToArray(tripRequestStatus);

      const tripRequestStatusFilter =
        requestedTripRequestStatuses && requestedTripRequestStatuses.length > 0
          ? requestedTripRequestStatuses
          : [Status.Approved, Status.Requested];

      const requestedTripStatuses = this.normalizeToArray(tripStatus);

      const isPaginated =
        page !== undefined &&
        page !== null &&
        limit !== undefined &&
        limit !== null &&
        !isNaN(Number(page)) &&
        !isNaN(Number(limit)) &&
        Number(page) > 0 &&
        Number(limit) > 0;

      const tripInclude: any = {
        model: Trip,
        as: 'trip',
        attributes: ['id', 'status', 'lockStatus', 'routeNumber'],
        required: false,
      };

      if (requestedTripStatuses && requestedTripStatuses.length > 0) {
        tripInclude.where = {
          status: {
            [Op.in]: requestedTripStatuses,
          },
        };
      }

      const queryOptions: any = {
        where: {
          ...whereCondition,
          ...whereConditionDate,
          status: {
            [Op.in]: tripRequestStatusFilter,
          },
        },
        attributes: [
          'id',
          'orgID',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'pickUpTime',
          'dropTime',
          'status',
          'locationType',
          'officeLocation',
          'geoCode',
          'locationName',
          'attendanceMode',
          'attendanceLocation',
          'attendanceTime',
          'emergencyType',
          'attendance',
          'tripID',
          'safeHome',
          'deboard',
          'deboardTime',
        ],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['name', 'email', 'phone', 'designation'],
          },
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name', 'status', 'logo'],
            required: false,
          },
          tripInclude,
        ],
      };

      if (isPaginated) {
        queryOptions.limit = Number(limit);
        queryOptions.offset = (Number(page) - 1) * Number(limit);
        queryOptions.order = [
          ['date', 'ASC'],
          ['shiftTime', 'ASC'],
        ];
      }

      const trips = await this.tripRequestModel.findAndCountAll(queryOptions);

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

  async findAllPastTripRequests(
    user?: any,
    page?: number,
    limit?: number,
    tripRequestStatus?: string | string[],
    tripStatus?: string | string[],
  ): Promise<PaginatedList<TripRequest>> {
    try {
      let whereCondition: any;
      if (!whereCondition) {
        whereCondition = {};
      }

      if (user?.userType !== UserType.SuperAdmin) {
        if (user?.employeeID !== null) {
          const employee = await this.employeeService.findOne(user?.employeeID);

          if (employee?.data?.employeeType === EmployeeType.Employee) {
            if (user?.employeeID !== null)
              whereCondition.employeeID = user?.employeeID;
            whereCondition.orgID = user?.orgID;
          }
          if (employee?.data?.employeeType === EmployeeType.Admin) {
            whereCondition.orgID = user?.orgID;
          }
        } else {
          whereCondition.orgID = user?.orgID;
        }
      }

      const currentDate = new Date();
      const formattedDate = currentDate.toISOString().split('T')[0];

      const whereConditionDate = {
        [Op.and]: [
          Sequelize.where(fn('DATE', col('TripRequest.date')), {
            [Op.lt]: formattedDate,
          }),
        ],
      };

      const requestedTripRequestStatuses =
        this.normalizeToArray(tripRequestStatus);

      const tripRequestStatusFilter =
        requestedTripRequestStatuses && requestedTripRequestStatuses.length > 0
          ? requestedTripRequestStatuses
          : [Status.Approved, Status.Requested];

      const requestedTripStatuses = this.normalizeToArray(tripStatus);

      const isPaginated =
        page !== undefined &&
        page !== null &&
        limit !== undefined &&
        limit !== null &&
        !isNaN(Number(page)) &&
        !isNaN(Number(limit)) &&
        Number(page) > 0 &&
        Number(limit) > 0;

      const tripInclude: any = {
        model: Trip,
        as: 'trip',
        attributes: ['id', 'status', 'lockStatus', 'routeNumber'],
        required: false,
      };

      if (requestedTripStatuses && requestedTripStatuses.length > 0) {
        tripInclude.where = {
          status: {
            [Op.in]: requestedTripStatuses,
          },
        };
      }

      const queryOptions: any = {
        where: {
          ...whereCondition,
          ...whereConditionDate,
          status: {
            [Op.in]: tripRequestStatusFilter,
          },
        },
        attributes: [
          'id',
          'orgID',
          'employeeID',
          'employeeCode',
          'date',
          'shiftTime',
          'pickDrop',
          'pickUpTime',
          'dropTime',
          'status',
          'locationType',
          'officeLocation',
          'geoCode',
          'locationName',
          'attendanceMode',
          'attendanceLocation',
          'attendanceTime',
          'emergencyType',
          'attendance',
          'tripID',
          'safeHome',
          'deboard',
          'deboardTime',
        ],
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['name', 'email', 'phone', 'designation'],
          },
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name', 'status', 'logo'],
            required: false,
          },
          tripInclude,
        ],
      };

      if (isPaginated) {
        queryOptions.limit = Number(limit);
        queryOptions.offset = (Number(page) - 1) * Number(limit);
        queryOptions.order = [
          ['date', 'DESC'],
          ['shiftTime', 'DESC'],
        ];
      }

      const trips = await this.tripRequestModel.findAndCountAll(queryOptions);

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

  async updateOtp(id: string, otp: string, user: any) {
    try {
      const requestById = await this.tripRequestModel.update(
        { attendanceOtp: otp },
        { where: { id: id } },
      );
      const eventPayload = JSON.parse(JSON.stringify(requestById));
      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: null,
        authID: user?.id,
        orgID: user?.orgID,
        updatedBy: user?.name,
        payload: requestById,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Trip requests updated successfully',
        data: requestById?.[0] ?? [1],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getTripRequestCountsByShiftTime(
    user?: any,
    startDate?: string,
    endDate?: string,
  ) {
    try {
      const whereClause: any = {
        orgID: user.orgID,
        status: Status.Approved,
      };
      if (startDate && endDate) {
        whereClause.date = {
          [Op.between]: [startDate, endDate],
        };
      }
      // const requestCountByshiftTime = await TripRequest.findAll({
      //   attributes: [
      //     'shiftTime',
      //     'pickDrop',
      //     // [Sequelize.fn('COUNT', Sequelize.col('id')), 'request'],
      //     [
      //       Sequelize.cast(
      //         Sequelize.fn('COUNT', Sequelize.col('id')),
      //         'INTEGER',
      //       ),
      //       'request',
      //     ],
      //   ],
      //   where: whereClause,
      //   group: ['shiftTime', 'pickDrop'],
      //   order: [
      //     [Sequelize.fn('LPAD', Sequelize.col('shiftTime'), 5, '0'), 'ASC'],
      //   ],
      //   raw: true,
      // });

      const requestCountByDate = await TripRequest.findAll({
        attributes: [
          [Sequelize.fn('DATE', Sequelize.col('date')), 'date'],
          [
            Sequelize.literal(
              `SUM(CASE WHEN "pickDrop" = true THEN 1 ELSE 0 END)`,
            ),
            'pickups',
          ],
          [
            Sequelize.literal(
              `SUM(CASE WHEN "pickDrop" = false THEN 1 ELSE 0 END)`,
            ),
            'drops',
          ],
        ],
        where: whereClause,
        group: [Sequelize.fn('DATE', Sequelize.col('date'))],
        order: [[Sequelize.fn('DATE', Sequelize.col('date')), 'ASC']],
        raw: true,
      });

      return requestCountByDate;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async guestEmployeeCheck(user: any, selectedOrgID: bigint) {
    try {
      // const orgId = user?.orgID;
      // const email = user?.email;
      // const phone = user?.phone;
      const employeeId = user?.employeeID;
      const employee = await this.employeeService.findOne(employeeId, user);
      const guest = await this.employeeService.findGuestEmployee(
        selectedOrgID,
        employee.data?.phone,
        employee.data?.email,
      );
      if (guest) {
        return guest;
      } else {
        const employee = await this.employeeService.createGuestEmployee(
          employeeId,
          selectedOrgID,
        );
        return employee;
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async markDeboard(
    markDeboardInput: MarkDeboardInput,
    user: any,
  ): Promise<GenericResponse<TripRequest>> {
    try {
      const { tripRequestID, employeeID, deboardLocation } = markDeboardInput;
      const employee = await this.employeeService.findOne(BigInt(employeeID));
      const orgID = employee?.data?.orgID;
      // Find the trip request
      const tripRequest = await this.tripRequestModel.findOne({
        where: {
          id: tripRequestID,
          employeeID: BigInt(employeeID),
          orgID: orgID,
        },
        include: [
          {
            model: Trip,
            as: 'trip',
            attributes: ['id', 'status'],
            required: false, // LEFT JOIN
          },
        ],
      });
      if (!tripRequest) {
        throw new NotFoundException('Trip request not found');
      }
      if (tripRequest?.trip?.status !== TripStatus?.Ongoing) {
        throw new BadRequestException(`Your trip hasn't started yet.`);
      }
      // Check if attendance is already marked
      if (tripRequest.deboard === true) {
        throw new BadRequestException(
          'Deboard already marked for this employee',
        );
      }

      // Update trip request with attendance details
      const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');
      // const markedTime = moment().format('DD-MMM-YYYY hh:mm');

      const [affectedCount] = await this.tripRequestModel.update(
        {
          deboard: true,
          deboardLocation: deboardLocation,
          deboardTime: currentDateTime,
          deboardMode: 'Manual',
        },
        {
          where: {
            id: tripRequestID,
            employeeID: employeeID,
          },
          returning: true,
        },
      );

      if (affectedCount === 0) {
        throw new BadRequestException('Failed to mark Deboard');
      }

      // Get updated trip request
      const updatedTripRequest = await this.tripRequestModel.findByPk(
        tripRequestID,
      );

      // *** NEW: Update Trip model's employees array ***
      if (tripRequest.tripID) {
        // Find the trip that contains this employee - convert bigint to string
        const trip = await this.tripService.findOne(Number(tripRequest.tripID));

        if (trip && trip.employees) {
          // Update the specific employee in the employees array
          const updatedEmployees = trip.employees.map((emp) => {
            if (emp.id === employeeID) {
              return {
                ...emp,
                deboard: true,
                deboardTime: currentDateTime,
                deboardLocation,
              };
            }
            return emp;
          });

          // Update the Trip model with the updated employees array - convert bigint to string
          await this.tripService.updateEmployeesArray(
            tripRequest.tripID.toString(),
            updatedEmployees,
          );
        }
      }
      // Validate deboard location against employee home point
      try {
        await this.driverTripService.validateDeboardDeviation(
          tripRequest,
          employee.data,
          deboardLocation,
          orgID,
        );
      } catch (err: any) {
        this.logger.error(
          `Deboard deviation check failed for trip request ${tripRequest.id}: ${err?.message}`,
        );
      }

      const isNowBetweenTimes = await this.isNowBetweenTimes(orgID);
      if (
        isNowBetweenTimes &&
        (await this.driverTripService.isSafeHomeGenderEligible(
          employee?.data?.gender,
          orgID,
        ))
      ) {
        // Context lets the safe-home outcome be attributed back to this trip
        // request. Without it the history row has null tripRequestID, the retry
        // cap counts across employees, and the escalation cannot raise an alert.
        void this.driverTripService
          .scheduleSafeHomeIvrCheck(tripRequest.id, employee?.data?.phone, {
            tripID: tripRequest.tripID,
            orgID,
            employeeID: tripRequest.employeeID,
          })
          .catch((err: any) =>
            this.logger.error(
              `Safe home IVR schedule failed for trip request ${tripRequest.id}: ${err?.message}`,
            ),
          );
        // await this.ivrService.initiateSafeHomeIVR(employee?.data?.phone);
      }

      // Create event log
      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripRequestID,
        authID: user.id,
        updatedBy: user.name,
        payload: updatedTripRequest,
        requestPayload: markDeboardInput,
        customDescription: `Employee deboard marked`,
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: 'Deboard marked successfully',
        data: updatedTripRequest,
      };
    } catch (error) {
      this.logger.error('Error marking deboard:', error);

      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to mark deboard attendance',
      );
    }
  }

  async isNowBetweenTimes(orgID: bigint): Promise<boolean> {
    // const startTimeStr = await this.configService.getConfigValue(
    //   'NIGHT_SHIFT_START_TIME',
    //   orgID,
    // ); // format: 'HH:mm'

    // const endTimeStr = await this.configService.getConfigValue(
    //   'NIGHT_SHIFT_END_TIME',
    //   orgID,
    // ); // format: 'HH:mm'

    const configResponse = await this.configService.getMultipleConfigValues(
      ['Night shift start time', 'Night shift end time'],
      { orgID: orgID },
    );
    const {
      'Night shift start time': startTimeStr,
      'Night shift end time': endTimeStr,
    } = configResponse?.data || {};

    // Get current time in Asia/Kolkata
    const now = moment.tz('Asia/Kolkata');
    const nowMinutes = now.hours() * 60 + now.minutes();

    const [startHour, startMinute] = startTimeStr.split(':').map(Number);
    const [endHour, endMinute] = endTimeStr.split(':').map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    if (startMinutes <= endMinutes) {
      // Same-day range (e.g., 09:00–17:00)
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 18:00–06:00)
      return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    }
  }

  // Add to TripRequestService
  async getShiftTimesData(
    etmsFilterInput: ETMSFilterInput,
    user: any,
  ): Promise<any> {
    try {
      const {
        take = 25,
        skip = 0,
        month = moment().format('YYYY-MM'),
        search,
      } = etmsFilterInput;

      // Parse month
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = moment(`${year}-${monthNum}-01`).startOf('month');
      const endDate = moment(startDate).endOf('month');
      const daysInMonth = endDate.date();

      // Build employee where clause
      let employeeWhereClause: any = {
        orgID: user.orgID,
        employeeType: EmployeeType.Employee,
      };

      // if (search) {
      //   employeeWhereClause = {
      //     ...employeeWhereClause,
      //     [Op.or]: [
      //       { name: { [Op.iLike]: `%${search}%` } },
      //       { employeeCode: { [Op.iLike]: `%${search}%` } },
      //       { email: { [Op.iLike]: `%${search}%` } },
      //     ],
      //   };
      // }
      if (search) {
        // Handle multiple delimiters: comma, space, semicolon, tab, newline
        const searchTerms = search
          .split(/[,;\s\n\t]+/)
          .map((term) => term.trim())
          .filter((term) => term.length > 0);

        if (searchTerms.length > 0) {
          const searchConditions = [];

          searchTerms.forEach((term) => {
            searchConditions.push(
              { name: { [Op.iLike]: `%${term}%` } },
              { email: { [Op.iLike]: `%${term}%` } },
              { employeeCode: { [Op.iLike]: `%${term}%` } },
            );
          });
          employeeWhereClause = {
            ...employeeWhereClause,
            [Op.or]: searchConditions,
          };
        }
      }

      // Get paginated employees
      const employees = await this.employeeModel.findAndCountAll({
        where: employeeWhereClause,
        limit: take,
        offset: skip * take,
        order: [['name', 'ASC']],
        attributes: ['id', 'name', 'employeeCode', 'email'],
      });

      // Get trip requests for all employees in the date range
      const employeeIds = employees.rows.map((emp) => emp.id);

      const tripRequests = await this.tripRequestModel.findAll({
        where: {
          employeeID: { [Op.in]: employeeIds },
          date: {
            [Op.between]: [
              startDate.format('YYYY-MM-DD'),
              endDate.format('YYYY-MM-DD'),
            ],
          },
          status: { [Op.in]: [Status.Approved, Status.Requested] },
        },
        attributes: ['employeeID', 'date', 'shiftTime', 'pickDrop'],
      });

      // Group trip requests by employee and date
      const tripRequestMap = new Map();

      tripRequests.forEach((trip) => {
        const day = moment(trip.date).date();
        const employeeId = trip.employeeID.toString();

        if (!tripRequestMap.has(employeeId)) {
          tripRequestMap.set(employeeId, {});
        }

        const employeeTripData = tripRequestMap.get(employeeId);

        if (!employeeTripData[day]) {
          employeeTripData[day] = { pickup: null, dropoff: null };
        }

        if (trip.pickDrop) {
          employeeTripData[day].pickup = trip.shiftTime;
        } else {
          employeeTripData[day].dropoff = trip.shiftTime;
        }
      });

      // Format response data
      const formattedEmployees = employees.rows.map((employee) => {
        const employeeTripData =
          tripRequestMap.get(employee.id.toString()) || {};
        const tripData: any = {};

        // Generate trip data for all days in month
        for (let day = 1; day <= daysInMonth; day++) {
          const dayData = employeeTripData[day];
          if (dayData && (dayData.pickup || dayData.dropoff)) {
            const pickup = dayData.pickup || '';
            const dropoff = dayData.dropoff || '';
            tripData[day] =
              pickup && dropoff
                ? `${pickup} P / ${dropoff} D`
                : pickup
                ? `${pickup} P`
                : dropoff
                ? `${dropoff} D`
                : '';
          } else {
            tripData[day] = '';
          }
        }

        return {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode,
          email: employee.email,
          tripData,
        };
      });

      return {
        totalItems: employees.count,
        items: formattedEmployees,
        monthInfo: {
          year,
          month: monthNum,
          daysInMonth,
        },
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /*
  "daily,previousday,10:00"         → { mode: 'daily', cutoff Type: 'previousday | sameday', cutoffTime: '10:00' }
  "weekly,wednesday,20:00,monday"   → { mode: 'weekly', dayOfWeek: 'wednesday', cutoffTime: '20:00', weekStart: Monday }
  "monthly,28,20:00"               →  { mode: 'monthly', dayOfMonth: 28, cutoffTime: '20:00'}
  "hourly,18,24"                   -> { mode: 'hourly', lowerCutoff: '18',upperCutoff:'120'}
  */

  async applyCutoffValidation(
    configValue: string,
    selectedDates: string[],
    time: string,
    pickDrop: 'login' | 'logout',
    user?: any,
  ) {
    if (!configValue || !time) return;

    // ALWAYS validate that the shift has not passed
    await this.validatePastShift(selectedDates, time, pickDrop);

    //  Admin/SuperAdmin: cutoff validation is skipped.
    const bypassCutoff = await this.shouldUserBypassCutoff(user);

    if (bypassCutoff) {
      return;
    }

    const parts = configValue.split(',').map((v) => v.trim().toLowerCase());
    const mode = parts[0];
    const now = moment();

    /* --------------------------------
       HOURLY 
    ---------------------------------*/
    if (mode === 'hourly') {
      const lowerCutoff = Number(parts[1] ?? 0);
      const upperCutoff = Number(parts[2] ?? 0);

      for (const date of selectedDates) {
        const selectedDateTime = moment(date).set({
          hour: Number(time.split(':')[0]),
          minute: Number(time.split(':')[1]),
          second: 0,
          millisecond: 0,
        });

        // Never allow requests for a past shift
        if (!now.isBefore(selectedDateTime)) {
          throw new BadRequestException(
            `${pickDrop.toUpperCase()} trip cannot be created. ` +
              `The ${pickDrop} time (${selectedDateTime.format(
                'DD/MM/YYYY hh:mm A',
              )}) has already passed.`,
          );
        }

        const diffInHours = selectedDateTime.diff(now, 'hours', true);

        if (lowerCutoff && diffInHours < lowerCutoff) {
          throw new BadRequestException(
            `${pickDrop.toUpperCase()} trip cannot be created. ` +
              `Selected time ${selectedDateTime.format('DD/MM/YYYY HH:mm')} ` +
              `is within lower cutoff (${lowerCutoff} hrs).`,
          );
        }

        if (upperCutoff && diffInHours > upperCutoff) {
          throw new BadRequestException(
            `${pickDrop.toUpperCase()} trip cannot be created. ` +
              `Selected time ${selectedDateTime.format('DD/MM/YYYY HH:mm')} ` +
              `exceeds upper cutoff (${upperCutoff} hrs).`,
          );
        }
      }
      return;
    }

    // DAILY
    if (mode === 'daily') {
      await this.validateDailyCutoff(
        selectedDates,
        configValue,
        time,
        pickDrop,
      );
      return;
    }

    // WEEKLY

    if (mode === 'weekly') {
      await this.validateWeeklyCutoff(selectedDates, configValue, pickDrop);
      return;
    }

    /*MONTHLY*/
    if (mode === 'monthly') {
      await this.validateMonthlyCutoff(selectedDates, configValue, pickDrop);
      return;
    }

    throw new BadRequestException(`Invalid cutoff mode: ${mode}`);
  }

  async employeeTripRequestNew(
    createTripRequestInput: CreateTripRequestInput,
    user?: any,
  ): Promise<GenericResponse<TripRequest>> {
    let employee: any;
    try {
      const organizationID =
        createTripRequestInput.selectedOrgID ?? user?.orgID;
      const employeeID =
        createTripRequestInput.guestEmployeeID ?? user?.employeeID;

      const { selectedDates, loginTime, logoutTime, status, emergencyType } =
        createTripRequestInput;

      // 1 Auto approval
      const approvalType = await this.configService.getConfigValue(
        'AUTO_APPROVAL_TRIP_REQUEST',
        organizationID,
      );

      const updatedStatus = approvalType === 'Yes' ? Status.Approved : status;

      employee = await this.employeeService.findOne(employeeID);
      if (!employee) {
        throw new BadRequestException('Employee not found.');
      }

      // AUTO LOGOUT FEATURE
      let effectiveLogoutTime = logoutTime;

      if (loginTime && !logoutTime) {
        effectiveLogoutTime = await this.calculateAutoLogoutTime(
          employee.data,
          loginTime,
        );
      }
      // console.log("effectiveLogoutTime-->",effectiveLogoutTime);

      // const configResponse = await this.configService.getMultipleConfigValues(
      //   ['PICKUP_SCHEDULE_CUTOFF', 'DROP_SCHEDULE_CUTOFF'],
      //   { orgID: organizationID },
      // );
      // const {
      //   PICKUP_SCHEDULE_CUTOFF: pickupCutoffConfig,
      //   DROP_SCHEDULE_CUTOFF: dropCutoffConfig,
      // } = configResponse?.data || {};

      // Team config checking before org config (general)
      const {
        pickupConfig,
        dropConfig,
        skipPickupValidation,
        skipDropValidation,
        pickupDisabled,
        dropDisabled,
      } = await this.resolveBookCutoffConfig(employee, organizationID);

      // if (!pickupCutoffConfig && loginTime) {
      //   throw new BadRequestException(
      //     'Pickup schedule cutoff configuration is not set.',
      //   );
      // }

      // if (!dropCutoffConfig && effectiveLogoutTime) {
      //   throw new BadRequestException(
      //     'Drop schedule cutoff configuration is not set.',
      //   );
      // }

      // ---------------------------------------
      // NEW: Team-level action disabled
      // ---------------------------------------
      if (loginTime && pickupDisabled) {
        throw new BadRequestException(
          'Pickup trip requests are disabled for your team. Please contact your administrator.',
        );
      }

      if (effectiveLogoutTime && dropDisabled) {
        throw new BadRequestException(
          'Drop trip requests are disabled for your team. Please contact your administrator.',
        );
      }

      if (!pickupConfig && loginTime && !skipPickupValidation) {
        throw new BadRequestException(
          'Pickup schedule cutoff configuration is not set.',
        );
      }

      // if (!dropConfig && logoutTime && !skipDropValidation) {
      if (!dropConfig && effectiveLogoutTime && !skipDropValidation) {
        throw new BadRequestException(
          'Drop schedule cutoff configuration is not set.',
        );
      }

      /* --------------------------------
       3️ Past date validation
    ---------------------------------*/
      for (const date of selectedDates) {
        if (moment(date).isBefore(moment(), 'day')) {
          throw new BadRequestException(
            `Trip date ${moment(date).format(
              'DD/MM/YYYY',
            )} cannot be in the past`,
          );
        }
      }

      // if (!emergencyType) {
      //   if (loginTime) {
      //     await this.applyCutoffValidation(
      //       pickupCutoffConfig,
      //       selectedDates,
      //       loginTime,
      //       'login',
      //     );
      //   }

      //   if (logoutTime) {
      //     await this.applyCutoffValidation(
      //       dropCutoffConfig,
      //       selectedDates,
      //       logoutTime,
      //       'logout',
      //     );
      //   }
      // }

      // if (!emergencyType) {
      //   if (loginTime && !skipPickupValidation) {
      //     await this.applyCutoffValidation(
      //       pickupConfig,
      //       selectedDates,
      //       loginTime,
      //       'login',
      //     );
      //   }

      //   // if (logoutTime && !skipDropValidation) {
      //   if (effectiveLogoutTime && !skipDropValidation) {
      //     await this.applyCutoffValidation(
      //       dropConfig,
      //       selectedDates,
      //       // logoutTime,
      //       effectiveLogoutTime,
      //       'logout',
      //     );
      //   }
      // }
      if (!emergencyType) {
        if (loginTime) {
          await this.validatePastShift(selectedDates, loginTime, 'login');

          if (!skipPickupValidation) {
            await this.applyCutoffValidation(
              pickupConfig,
              selectedDates,
              loginTime,
              'login',
            );
          }
        }

        if (effectiveLogoutTime) {
          await this.validatePastShift(
            selectedDates,
            effectiveLogoutTime,
            'logout',
          );

          if (!skipDropValidation) {
            await this.applyCutoffValidation(
              dropConfig,
              selectedDates,
              effectiveLogoutTime,
              'logout',
            );
          }
        }
      }

      /* --------------------------------
       5️ Existing trip validation
    ---------------------------------*/
      const checkDates: { date: string; pickDrop: boolean }[] = [];

      for (const date of selectedDates) {
        if (loginTime) {
          checkDates.push({
            date: moment(date).format('YYYY-MM-DD'),
            pickDrop: true,
          });
        }

        // if (logoutTime) {
        if (effectiveLogoutTime) {
          checkDates.push({
            date: moment(date).format('YYYY-MM-DD'),
            pickDrop: false,
          });
        }
      }

      if (!emergencyType) {
        const existingTrips = await this.tripRequestModel.findAll({
          where: {
            employeeID: employeeID,
            status: {
              [Op.in]: [Status.Approved, Status.Requested],
            },
            [Op.or]: checkDates.map(({ date, pickDrop }) => ({
              date,
              pickDrop,
            })),
          },
        });

        if (existingTrips.length > 0) {
          const existingDetails = existingTrips
            .map(
              (trip) =>
                `Date: ${moment(trip.date).format('DD/MM/yyyy')}, Shift Time: ${
                  trip.shiftTime
                }`,
            )
            .join('; ');

          throw new BadRequestException(
            `Trip request already exists for the following dates and times: ${existingDetails}`,
          );
        }
      }

      if (emergencyType) {
        await this.tripRequestModel.update(
          { status: Status.Cancelled },
          {
            where: {
              date: moment(new Date()).format('YYYY-MM-DD'),
              pickDrop: false,
            },
            returning: true,
          },
        );
      }

      /* --------------------------------
       6️ Trip creation
    ---------------------------------*/
      const tripRequests = selectedDates.flatMap((date) => {
        const tripRecords = [];
        const otp = generateOTP();
        if (loginTime) {
          tripRecords.push({
            ...createTripRequestInput,
            employeeID: employeeID,
            employeeCode: employee?.data?.employeeCode,
            orgID: organizationID,
            teamID: employee?.data?.teamID,
            processID: employee?.data?.processID,
            locationID: employee?.data?.locationID,
            locationName: employee?.data?.location?.name,
            date: moment(date).format('YYYY-MM-DD'),
            shiftTime: normalizeTime(loginTime),
            pickDrop: true,
            geoCode: employee?.data?.homePoint,
            status: updatedStatus ?? Status.Active,
            attendanceOtp: otp,
          });
        }

        // if (logoutTime) {
        if (effectiveLogoutTime) {
          let logoutDate = moment(date).format('YYYY-MM-DD');

          // Check for next day dropoff: existing business rule OR cross-day scenario
          // if (loginTime && logoutTime) {
          if (loginTime && effectiveLogoutTime) {
            // const loginHour = parseInt(loginTime.split(':')[0], 10);
            const [pickupHour, pickupMin] = loginTime.split(':').map(Number);

            // const [dropoffHour, dropoffMin] = logoutTime.split(':').map(Number);
            const [dropoffHour, dropoffMin] = effectiveLogoutTime
              .split(':')
              .map(Number);

            const pickupMinutes = pickupHour * 60 + pickupMin;
            const dropoffMinutes = dropoffHour * 60 + dropoffMin;

            // Existing business rule:  new logic: pickup time > dropoff time
            if (pickupMinutes > dropoffMinutes) {
              const nextDay = new Date(date);
              nextDay.setDate(nextDay.getDate() + 1);
              logoutDate = nextDay.toISOString().split('T')[0];
            }
          }

          const otp = generateOTP();
          tripRecords.push({
            ...createTripRequestInput,
            employeeID: employeeID,
            employeeCode: employee?.data?.employeeCode,
            orgID: organizationID,
            teamID: employee?.data?.teamID,
            processID: employee?.data?.processID,
            locationID: employee?.data?.locationID,
            locationName: employee?.data?.location?.name,
            date: logoutDate,
            // shiftTime: normalizeTime(logoutTime),
            shiftTime: normalizeTime(effectiveLogoutTime),
            pickDrop: false,
            geoCode: employee?.data?.homePoint,
            status: updatedStatus ?? Status.Active,
            emergencyType: emergencyType ?? null,
            attendanceOtp: otp,
          });
        }

        return tripRecords;
      });
      const trips = await this.tripRequestModel.bulkCreate(tripRequests);
      const eventPayload = JSON.parse(JSON.stringify(tripRequests));
      const eventLogs = trips.map((trip, index) => ({
        objectType: 'Trip Request',
        changeType: 'add',
        objectID: trip.id,
        authID: user.id,
        orgID: organizationID,
        updatedBy: user.name,
        // Logged payload deliberately scoped to just date + shiftTime -
        // the two fields the Event Logs UI actually needs for a Trip
        // Request 'add' entry. Keeps the row small and keeps
        // attendanceOtp (and everything else on the created row) out of
        // the audit table entirely, rather than filtering it at render
        // time.
        payload: {
          date: trip.date,
          shiftTime: trip.shiftTime,
          employeeName: employee?.data?.name ?? null,
          employeeCode: employee?.data?.employeeCode ?? null,
        },
        requestPayload: eventPayload[index],
        user,
      }));

      await this.eventlogService.bulkCreate(eventLogs);
      return {
        message: `${trips.length} trip request(s) created successfully.`,
        data: trips[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        // Fire-and-forget: record the rejection reason before re-throwing,
        // so a failed attempt (cutoff exceeded, employee already booked,
        // etc.) leaves a trace instead of vanishing with the 400 response.
        // Scoped to error.status !== 500 - a genuine system fault isn't a
        // "business rejection" and shouldn't be logged as one.
        this.eventlogService.create({
          objectType: 'Trip Request',
          changeType: 'add-failed',
          objectID: null,
          authID: user?.id,
          orgID: createTripRequestInput.selectedOrgID ?? user?.orgID,
          updatedBy: user?.name,
          payload: {
            employeeID:
              createTripRequestInput.guestEmployeeID ?? user?.employeeID,
            employeeName: employee?.data?.name ?? null,
            employeeCode: employee?.data?.employeeCode ?? null,
            selectedDates: Array.isArray(createTripRequestInput.selectedDates)
              ? createTripRequestInput.selectedDates
                  .map((d) => {
                    const date = new Date(d);
                    if (isNaN(date.getTime())) return d;
                    const day = String(date.getUTCDate()).padStart(2, '0');
                    const month = String(date.getUTCMonth() + 1).padStart(
                      2,
                      '0',
                    );
                    const year = date.getUTCFullYear();
                    return `${day}/${month}/${year}`;
                  })
                  .join(', ')
              : createTripRequestInput.selectedDates,
            loginTime: createTripRequestInput.loginTime,
            logoutTime: createTripRequestInput.logoutTime,
          },
          requestPayload: createTripRequestInput,
          customDescription: `attempted to create Trip Request - ${error.message}`,
          user,
        });
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  private async resolveBookCutoffConfig(
    employee: any,
    organizationID: bigint,
  ): Promise<{
    pickupConfig: string | null;
    dropConfig: string | null;
    skipPickupValidation: boolean;
    skipDropValidation: boolean;
    pickupDisabled: boolean; // NEW
    dropDisabled: boolean; // NEW
  }> {
    // ----------------------------
    // Organization Config
    // ----------------------------
    const configResponse = await this.configService.getMultipleConfigValues(
      ['PICKUP_SCHEDULE_CUTOFF', 'DROP_SCHEDULE_CUTOFF'],
      { orgID: organizationID },
    );

    const {
      PICKUP_SCHEDULE_CUTOFF: orgPickupConfig,
      DROP_SCHEDULE_CUTOFF: orgDropConfig,
    } = configResponse?.data || {};

    // default behaviour
    let pickupConfig = orgPickupConfig;
    let dropConfig = orgDropConfig;

    let skipPickupValidation = false;
    let skipDropValidation = false;
    let pickupDisabled = false; // NEW
    let dropDisabled = false; // NEW

    const team = employee?.data?.team;

    // ---------------------------------------
    // if Employee has no team
    // ---------------------------------------
    if (!team) {
      return {
        pickupConfig,
        dropConfig,
        skipPickupValidation,
        skipDropValidation,
        pickupDisabled,
        dropDisabled,
      };
    }

    // ---------------------------------------
    // If Team Config Disabled
    // ---------------------------------------
    if (!team.isTeamConfigEnabled) {
      return {
        pickupConfig,
        dropConfig,
        skipPickupValidation,
        skipDropValidation,
        pickupDisabled,
        dropDisabled,
      };
    }

    const bookConfig = team.teamConfig?.BOOK;

    // ---------------------------------------
    // If BOOK missing
    // ---------------------------------------
    if (!bookConfig) {
      return {
        pickupConfig,
        dropConfig,
        skipPickupValidation,
        skipDropValidation,
        pickupDisabled,
        dropDisabled,
      };
    }

    // ===========================================
    // PICK
    // ===========================================

    if (bookConfig.PICK === 'disable') {
      pickupDisabled = true; // NEW — checked first, short-circuits everything else
    } else if (bookConfig.PICK === '') {
      skipPickupValidation = true;
    } else if (bookConfig.PICK != null) {
      pickupConfig = bookConfig.PICK;
    }

    // ===========================================
    // DROP
    // ===========================================

    if (bookConfig.DROP === 'disable') {
      dropDisabled = true; // NEW
    } else if (bookConfig.DROP === '') {
      skipDropValidation = true;
    } else if (bookConfig.DROP != null) {
      dropConfig = bookConfig.DROP;
    }

    return {
      pickupConfig,
      dropConfig,
      skipPickupValidation,
      skipDropValidation,
      pickupDisabled, // NEW
      dropDisabled, // NEW
    };
  }

  async createBatchTripRequestNew(
    createTripRequestInput: CreateTripRequestInput,
    user?: any,
  ): Promise<GenericResponse<TripRequest>> {
    let employees: any[] = [];
    try {
      const organizationID =
        createTripRequestInput.selectedOrgID ?? user?.orgID;
      const { selectedDates, loginTime, logoutTime, status, employeeCodes } =
        createTripRequestInput;
      const approvalType = await this.configService.getConfigValue(
        'AUTO_APPROVAL_TRIP_REQUEST',
        user?.orgID,
      );
      const updatedStatus = approvalType === 'Yes' ? Status.Approved : status;

      employees = await this.employeeModel.findAll({
        where: {
          employeeCode: {
            [Op.in]: employeeCodes,
          },
          orgID: user?.orgID,
          status: Status.Active,
        },
        include: [
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
        ],
      });

      const validEmployeeCodes = new Set(
        employees.map((emp) => emp.employeeCode),
      );
      const invalidEmployeeCodes = employeeCodes.filter(
        (code) => !validEmployeeCodes.has(code),
      );

      if (invalidEmployeeCodes.length > 0) {
        const chunkSize = 5;
        const formattedList = invalidEmployeeCodes
          .reduce((acc, code, i) => {
            const chunkIndex = Math.floor(i / chunkSize);
            acc[chunkIndex] = acc[chunkIndex] || [];
            acc[chunkIndex].push(code);
            return acc;
          }, [] as string[][])
          .map((group) => group.join(', '))
          .join('\n');

        throw new BadRequestException(
          `Invalid Employee Codes found:\n${formattedList}`,
        );
      }

      const configResponse = await this.configService.getMultipleConfigValues(
        ['PICKUP_SCHEDULE_CUTOFF', 'DROP_SCHEDULE_CUTOFF'],
        { orgID: organizationID },
      );
      const {
        PICKUP_SCHEDULE_CUTOFF: pickupCutoffConfig,
        DROP_SCHEDULE_CUTOFF: dropCutoffConfig,
      } = configResponse?.data || {};
      if (!pickupCutoffConfig && loginTime) {
        throw new BadRequestException('Pickup cutoff configuration not set');
      }

      if (!dropCutoffConfig && logoutTime) {
        throw new BadRequestException('Drop cutoff configuration not set');
      }

      for (const date of selectedDates) {
        if (moment(date).isBefore(moment(), 'day')) {
          throw new BadRequestException(
            `Trip date ${moment(date).format(
              'DD/MM/YYYY',
            )} cannot be in the past`,
          );
        }
      }

      /* --------------------------------
               Apply cutoff validation
    ---------------------------------*/
      if (loginTime) {
        await this.applyCutoffValidation(
          pickupCutoffConfig,
          selectedDates,
          loginTime,
          'login',
          user,
        );
      }

      if (logoutTime) {
        await this.applyCutoffValidation(
          dropCutoffConfig,
          selectedDates,
          logoutTime,
          'logout',
          user,
        );
      }
      //existing trip validation

      const checkDates: { date: string; pickDrop: boolean }[] = [];

      for (const date of selectedDates) {
        // Add pickup validation
        if (loginTime) {
          checkDates.push({
            date: moment(date).format('YYYY-MM-DD'),
            pickDrop: true,
          });
        }

        // Add dropoff validation with cross-day logic
        if (logoutTime) {
          let logoutDate = moment(date).format('YYYY-MM-DD');

          // Apply the same cross-day logic here as in trip creation
          if (loginTime && logoutTime) {
            const [pickupHour, pickupMin] = loginTime.split(':').map(Number);
            const [dropoffHour, dropoffMin] = logoutTime.split(':').map(Number);

            const pickupMinutes = pickupHour * 60 + pickupMin;
            const dropoffMinutes = dropoffHour * 60 + dropoffMin;

            // Same logic: pickup time > dropoff time means next day dropoff
            if (pickupMinutes > dropoffMinutes) {
              const nextDay = new Date(date);
              nextDay.setDate(nextDay.getDate() + 1);
              logoutDate = nextDay.toISOString().split('T')[0];
            }
          }

          checkDates.push({
            date: logoutDate, // Use calculated date, not original date
            pickDrop: false,
          });
        }
      }

      // Check for existing trips with correct dates
      const existingTrips = await this.tripRequestModel.findAll({
        where: {
          employeeCode: {
            [Op.in]: employeeCodes,
          },
          orgID: user?.orgID,
          status: {
            [Op.in]: [Status.Approved, Status.Requested],
          },
          [Op.or]: checkDates.map(({ date, pickDrop }) => ({
            date,
            pickDrop,
          })),
        },
      });

      if (existingTrips.length > 0) {
        // Capped display — a large batch (50+ employees x 2 shifts) produces
        // a message several thousand characters long. That full string became
        // error.message, which fed the 'add-failed' event log's
        // description column: a hard varchar(255) in Postgres (confirmed by
        // the "value too long for type character varying(255)" failure this
        // was producing). Cap here keeps both the thrown exception and the
        // downstream log readable and safely sized.
        const EXISTING_DETAILS_DISPLAY_CAP = 15;
        const existingDetailsList = existingTrips.map(
          (trip) =>
            `Date: ${moment(trip.date).format('DD/MM/yyyy')}, Shift Time: ${
              trip.shiftTime
            }, Employee Code: ${trip.employeeCode}`,
        );
        const existingDetails = existingDetailsList
          .slice(0, EXISTING_DETAILS_DISPLAY_CAP)
          .join('; ');
        const remainder =
          existingDetailsList.length - EXISTING_DETAILS_DISPLAY_CAP;
        const suffix = remainder > 0 ? `; and ${remainder} more` : '';

        throw new BadRequestException(
          `Trip request already exists for the following dates and times: ${existingDetails}${suffix}`,
        );
      }

      // Rest of the trip creation logic remains the same...
      const tripRequests = employees.flatMap((employee) =>
        selectedDates.flatMap((date) => {
          const tripRecords = [];
          const otp = generateOTP();

          if (loginTime) {
            tripRecords.push({
              ...createTripRequestInput,
              employeeID: employee.id,
              employeeCode: employee.employeeCode,
              orgID: employee.orgID,
              teamID: employee.teamID,
              processID: employee.processID,
              locationID: employee.locationID,
              geoCode: employee.homePoint,
              locationName: employee.location?.name,
              date: moment(date).format('YYYY-MM-DD'),
              shiftTime: normalizeTime(loginTime),
              pickDrop: true,
              status: updatedStatus ?? Status.Active,
              attendanceOtp: otp,
              emergencyType: null,
            });
          }

          if (logoutTime) {
            let logoutDate = moment(date).format('YYYY-MM-DD');

            // Check for next day dropoff: existing business rule OR cross-day scenario
            if (loginTime && logoutTime) {
              const [pickupHour, pickupMin] = loginTime.split(':').map(Number);
              const [dropoffHour, dropoffMin] = logoutTime
                .split(':')
                .map(Number);

              const pickupMinutes = pickupHour * 60 + pickupMin;
              const dropoffMinutes = dropoffHour * 60 + dropoffMin;

              if (pickupMinutes > dropoffMinutes) {
                const nextDay = new Date(date);
                nextDay.setDate(nextDay.getDate() + 1);
                logoutDate = nextDay.toISOString().split('T')[0];
              }
            }

            const otp = generateOTP();
            tripRecords.push({
              ...createTripRequestInput,
              employeeID: employee?.id,
              employeeCode: employee?.employeeCode,
              orgID: employee?.orgID,
              teamID: employee?.teamID,
              processID: employee?.processID,
              locationID: employee?.locationID,
              locationName: employee?.location?.name,
              date: logoutDate,
              shiftTime: normalizeTime(logoutTime),
              pickDrop: false,
              geoCode: employee.homePoint,
              status: updatedStatus ?? Status.Active,
              emergencyType: null,
              attendanceOtp: otp,
            });
          }

          return tripRecords;
        }),
      );

      const trips = await this.tripRequestModel.bulkCreate(tripRequests);
      const eventPayload = JSON.parse(JSON.stringify(tripRequests));

      const employeeCodesJoined = employees
        .map((emp) => emp.employeeCode)
        .join(', ');

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

      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      trips.forEach((trip) => {
        changeJSON[`Trip Request ${trip.id} (${trip.employeeCode})`] = {
          OldValue: 'N/A',
          newValue: `${formatDateOnly(trip.date)} - ${trip.shiftTime} - ${
            trip.pickDrop ? 'Pick' : 'Drop'
          }`,
        };
      });

      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'add',
        objectID: trips.length === 1 ? trips[0].id : null,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: {
          employeeCodes: employeeCodesJoined,
        },
        requestPayload: eventPayload,
        changeJSON,
        customDescription: 'created Batch Trip Requests',
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: `${trips.length} trip request(s) created successfully.`,
        data: trips[0],
      };
    } catch (error: any) {
      if (error.status !== 500) {
        // Formats a date as DD/MM/YYYY, date-only.
        const formatDateOnly = (value: any): string => {
          if (!value) return String(value ?? '');
          const d = new Date(value);
          if (isNaN(d.getTime())) return String(value);
          const day = String(d.getUTCDate()).padStart(2, '0');
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const year = d.getUTCFullYear();
          return `${day}/${month}/${year}`;
        };

        // description is a hard varchar(255) column (confirmed via the actual
        // "value too long for type character varying(255)" failure this was
        // producing for large batches). Cap the FINAL customDescription
        // string itself, not just error.message before the prefix is added -
        // a fixed cap on the message body alone doesn't guarantee the
        // prefixed result stays under 255 if the prefix text ever changes.
        // Full, untruncated detail is preserved in payload.failureReason,
        // where a JSON/JSONB column has much more room than a description
        // varchar typically does.
        const MAX_DESCRIPTION_LENGTH = 250; // safety margin under the 255 hard cap
        const rawDescription = `attempted to create Trip Request - ${error.message}`;
        const customDescription =
          rawDescription.length > MAX_DESCRIPTION_LENGTH
            ? `${rawDescription.slice(0, MAX_DESCRIPTION_LENGTH - 3)}...`
            : rawDescription;

        this.eventlogService
          .create({
            objectType: 'Trip Request',
            changeType: 'add-failed',
            objectID: null,
            authID: user?.id,
            orgID: createTripRequestInput.selectedOrgID ?? user?.orgID,
            updatedBy: user?.name,
            payload: {
              employeeCodes: Array.isArray(createTripRequestInput.employeeCodes)
                ? createTripRequestInput.employeeCodes.join(', ')
                : createTripRequestInput.employeeCodes,
              selectedDates: Array.isArray(createTripRequestInput.selectedDates)
                ? createTripRequestInput.selectedDates
                    .map(formatDateOnly)
                    .join(', ')
                : createTripRequestInput.selectedDates,
              loginTime: createTripRequestInput.loginTime,
              logoutTime: createTripRequestInput.logoutTime,
              failureReason: error.message,
            },
            requestPayload: createTripRequestInput,
            customDescription,
            user,
          })
          // Previously fire-and-forget with no failure handling - if the
          // insert itself threw (exactly what was happening here), that
          // rejection had nowhere to go and vanished silently. Now at least
          // surfaces in server logs instead of disappearing.
          .catch((logErr) =>
            this.logger.error(
              'Failed to write add-failed event log for batch trip request',
              logErr,
            ),
          );
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async validateWeeklyCutoff(
    selectedDates: string[],
    configValue: string,
    pickDrop?: 'login' | 'logout',
  ) {
    const [mode, cutoffDayRaw, cutoffTime, weekStartRaw] = configValue
      .split(',')
      .map((v) => v.trim().toLowerCase());

    if (mode !== 'weekly') {
      throw new BadRequestException('Invalid cutoff mode');
    }

    /* -------------------------------
     1️ Map weekday strings → ISO numbers
  --------------------------------*/
    const isoWeekdayMap: Record<string, number> = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sunday: 7,
    };

    const weekStart = isoWeekdayMap[weekStartRaw];
    const cutoffDay = isoWeekdayMap[cutoffDayRaw];

    if (!weekStart || !cutoffDay) {
      throw new BadRequestException(
        `Invalid weekday value in config: ${weekStartRaw} or ${cutoffDayRaw}`,
      );
    }

    const now = moment();

    /* -------------------------------
     2️ Compute cutoff datetime
  --------------------------------*/
    const cutoffDateTime = moment()
      .isoWeekday(cutoffDay) // thursday
      .set({
        hour: Number(cutoffTime.split(':')[0]),
        minute: Number(cutoffTime.split(':')[1]),
        second: 0,
        millisecond: 0,
      });

    // 3️ Rolling week decision

    const allowedWeekOffset = now.isAfter(cutoffDateTime) ? 2 : 1;

    /* -------------------------------
     4️ Compute allowed week range
  --------------------------------*/
    const allowedWeekStart = moment()
      .isoWeekday(weekStart) // monday
      .add(allowedWeekOffset, 'week')
      .startOf('day');

    // If your business allows Mon–Fri only
    const allowedWeekEnd = allowedWeekStart.clone().add(6, 'days').endOf('day');

    /* -------------------------------
     5️ Validate selected dates
  --------------------------------*/
    for (const date of selectedDates) {
      const selected = moment(date, 'YYYY-MM-DD');

      if (
        !selected.isBetween(allowedWeekStart, allowedWeekEnd, undefined, '[]')
      ) {
        throw new BadRequestException(
          `${
            pickDrop ? pickDrop.toUpperCase() + ' ' : ''
          }trip date ${selected.format(
            'DD/MM/YYYY',
          )} is not allowed due to weekly cutoff. ` +
            `Allowed date range: ${allowedWeekStart.format('DD/MM/YYYY')} to ` +
            `${allowedWeekEnd.format('DD/MM/YYYY')}`,
        );
      }
    }
  }

  async validateMonthlyCutoff(
    selectedDates: string[],
    configValue: string,
    pickDrop?: 'login' | 'logout',
  ) {
    const [mode, dayRaw, cutoffTime] = configValue
      .split(',')
      .map((v) => v.trim().toLowerCase());

    if (mode !== 'monthly') {
      throw new BadRequestException('Invalid cutoff mode');
    }

    const cutoffDay = Number(dayRaw);
    const now = moment();

    //If cutoff day exceeds month length,use last day of month instead
    const daysInMonth = moment().daysInMonth();

    const safeCutoffDay = Math.min(cutoffDay, daysInMonth);

    const cutoffDateTime = moment()
      .date(safeCutoffDay)
      .set({
        hour: Number(cutoffTime.split(':')[0]),
        minute: Number(cutoffTime.split(':')[1]),
        second: 0,
        millisecond: 0,
      });

    //  Determine which month is allowed,dynamically
    const allowedMonthOffset = now.isAfter(cutoffDateTime) ? 2 : 1;

    const allowedMonthStart = moment()
      .add(allowedMonthOffset, 'month')
      .startOf('month');

    const allowedMonthEnd = allowedMonthStart.clone().endOf('month');

    for (const date of selectedDates) {
      const selected = moment(date, 'YYYY-MM-DD');

      if (selected.isBefore(now, 'day')) {
        throw new BadRequestException(
          `Trip date ${selected.format('DD/MM/YYYY')} cannot be in the past`,
        );
      }

      if (
        !selected.isBetween(allowedMonthStart, allowedMonthEnd, undefined, '[]')
      ) {
        throw new BadRequestException(
          `${
            pickDrop ? pickDrop.toUpperCase() + ' ' : ''
          }trip date ${selected.format(
            'DD/MM/YYYY',
          )} is not allowed due to monthly cutoff. ` +
            `Allowed month: ${allowedMonthStart.format('MMMM YYYY')}`,
        );
      }
    }
  }

  private async validateDailyCutoff(
    selectedDates: string[],
    configValue: string,
    shiftTime: string,
    pickDrop: 'login' | 'logout',
  ): Promise<void> {
    const parts = configValue.split(',');

    const cutoffType = (parts[1] ?? '').toLowerCase(); // previousday | sameday
    const configuredCutoffTime = parts[2];

    if (!configuredCutoffTime) {
      throw new BadRequestException('Invalid daily cutoff configuration.');
    }

    const now = moment();

    const [configHour, configMinute] = configuredCutoffTime
      .split(':')
      .map(Number);

    const [shiftHour, shiftMinute] = shiftTime.split(':').map(Number);

    for (const date of selectedDates) {
      const selectedDate = moment(date);

      // ===========================================
      // PREVIOUS DAY
      // ===========================================
      if (cutoffType === 'previousday') {
        const tomorrow = now.clone().add(1, 'day').startOf('day');

        if (!selectedDate.isSame(tomorrow, 'day')) {
          throw new BadRequestException(
            `${pickDrop.toUpperCase()} trip can only be requested for tomorrow when using Previous Day cutoff`,
          );
        }
        // `${pickDrop.toUpperCase()} trip can only be requested for tomorrow when using Previous Day cutoff.`

        const cutoffDateTime = selectedDate.clone().subtract(1, 'day').set({
          hour: configHour,
          minute: configMinute,
          second: 0,
          millisecond: 0,
        });

        if (!now.isBefore(cutoffDateTime)) {
          throw new BadRequestException(
            `${pickDrop.toUpperCase()} trip cannot be created. ` +
              `The previous day cutoff (${cutoffDateTime.format(
                'DD/MM/YYYY hh:mm A',
              )}) has already passed.`,
          );
        }

        continue;
      }

      // ===========================================
      // SAME DAY
      // ===========================================
      if (cutoffType === 'sameday') {
        const today = now.clone().startOf('day');

        if (!selectedDate.isSame(today, 'day')) {
          throw new BadRequestException(
            `${pickDrop.toUpperCase()} trip can only be requested for today.`,
          );
        }

        const configuredCutoff = selectedDate.clone().set({
          hour: configHour,
          minute: configMinute,
          second: 0,
          millisecond: 0,
        });

        const shiftDateTime = selectedDate.clone().set({
          hour: shiftHour,
          minute: shiftMinute,
          second: 0,
          millisecond: 0,
        });

        // Shift time is earlier than configured cutoff
        if (shiftDateTime.isBefore(configuredCutoff)) {
          if (!now.isBefore(shiftDateTime)) {
            throw new BadRequestException(
              `${pickDrop.toUpperCase()} trip cannot be created. ` +
                `The ${pickDrop} time (${shiftDateTime.format(
                  'hh:mm A',
                )}) has already passed.`,
            );
          }
        }
        // Configured cutoff is earlier than shift time
        else {
          if (!now.isBefore(configuredCutoff)) {
            throw new BadRequestException(
              `${pickDrop.toUpperCase()} trip can only be requested on the same day before the cutoff time (${configuredCutoff.format(
                'hh:mm A',
              )}).`,
            );
          }
        }

        continue;
      }

      throw new BadRequestException(
        `Invalid daily cutoff type '${cutoffType}'.`,
      );
    }
  }

  async cancelOngoingTripRequest(
    tripRequestID: string,
    user: any,
  ): Promise<GenericResponse<null>> {
    try {
      const tripRequest = await this.tripRequestModel.findOne({
        where: { id: tripRequestID, employeeID: user?.employeeID },
      });
      if (!tripRequest) {
        throw new NotFoundException('Trip request not found');
      }
      // org Config feature flag check
      const cancelFeatureConfig = await this.configService.getConfigValue(
        'Employee Cancel Ongoing Trip',
        tripRequest.orgID,
      );
      if (cancelFeatureConfig !== 'Yes') {
        throw new ForbiddenException(
          'Your organization does not have this feature enabled.',
        );
      }

      if (!tripRequest.tripID) {
        throw new BadRequestException(
          'This trip request is not linked to an active trip.',
        );
      }

      const trip = await this.tripModel.findOne({
        where: { id: tripRequest.tripID },
      });
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }
      if (trip.status !== TripStatus.Ongoing) {
        throw new BadRequestException(
          `This action is only valid while the trip is Ongoing. Current status: ${trip.status}`,
        );
      }
      if (tripRequest.attendance === true) {
        throw new BadRequestException(
          'You have already boarded this trip and cannot cancel it from the app.',
        );
      }
      if (tripRequest.status === Status.EmployeeSelfNoShow) {
        throw new BadRequestException(
          'This trip request is already cancelled.',
        );
      }

      // Captured before the update below, so the event log shows the real
      // prior status rather than re-reading a possibly-mutated instance.
      // const previousStatus = tripRequest.status;

      const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');

      const [affectedCount] = await this.tripRequestModel.update(
        {
          status: Status.EmployeeSelfNoShow,
          attendance: false,
          attendanceTime: currentDateTime,
          noShow: false,
        },
        {
          where: { id: tripRequestID, employeeID: user?.employeeID },
          returning: true,
        },
      );
      if (affectedCount === 0) {
        throw new BadRequestException('Failed to cancel trip request');
      }

      //counter for noshow tracking and block the employee login.
      //counter for noshow tracking and block the employee login.
      await this.processNoShowForCounter(
        BigInt(user?.employeeID),
        true,
        tripRequest.orgID,
      );

      // Mirror on Trip.employees[] for the driver app — NO removal, NO reorder, NO recalculation.
      if (trip.employees) {
        const updatedEmployees = trip.employees.map((emp: any) => {
          if (Number(emp.tripRequestID) === Number(tripRequestID)) {
            return {
              ...emp,
              status: Status.EmployeeSelfNoShow,
              attendance: false,
              noShow: false,
            };
          }
          return emp;
        });
        await this.tripService.updateEmployeesArray(
          trip.id.toString(),
          updatedEmployees,
        );
      }

      // const updatedTripRequest = await this.tripRequestModel.findByPk(
      //   tripRequestID,
      // );
      // const newStatus = updatedTripRequest?.status ?? Status.EmployeeSelfNoShow;

      await this.eventlogService.create({
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripRequestID,
        authID: user.id,
        updatedBy: user.name,
        payload: {
          tripRequestID,
          tripID: trip.id,
        },
        requestPayload: { tripRequestID },
        customDescription: 'employee cancelled while trip was ongoing',
        user,
      });

      // const employee = await this.employeeService.findOne(
      //   BigInt(user?.employeeID),
      // );
      // if (employee?.data?.phone) {
      //   await this.notificationDispatcher.notify({
      //     organizationId: String(tripRequest.orgID),
      //     event: 'emp.cancel.ongoing.trip',
      //     locale: 'en',
      //     queue: true,
      //     recipient: {
      //       id: String(user?.employeeID),
      //       email: employee?.data?.email,
      //       firstName: employee?.data?.name,
      //       phoneNumber: employee?.data?.phone,
      //     },
      //     channels: [NotificationChannel.SMS],
      //     data: { firstName: employee?.data?.name, tripID: String(trip.id) },
      //     eventLogId: String(eventCreated?.id),
      //     tripID: String(trip.id),
      //     empID: String(user?.employeeID),
      //   });
      // }

      return { message: 'Trip request cancelled successfully', data: null };
    } catch (error) {
      this.logger.error('Error cancelling ongoing trip request:', error);
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException('Failed to cancel trip request');
    }
  }

  async processNoShowForCounter(
    employeeID: bigint,
    isNoShow: boolean,
    orgID: bigint,
  ): Promise<void> {
    const noShowLimit = Number(
      await this.configService.getConfigValue('MONTHLY_NO_SHOW_LIMIT', orgID),
    );
    if (!noShowLimit || isNaN(noShowLimit) || noShowLimit <= 0) {
      return;
    }

    const authRecord = await this.authModel.findOne({
      where: { employeeID },
    });
    if (!authRecord) {
      return;
    }

    if (!isNoShow) {
      if (authRecord.noShowCount !== 0) {
        await authRecord.update({ noShowCount: 0 });
      }
      return;
    }

    const newCount = authRecord.noShowCount + 1;

    if (newCount >= noShowLimit) {
      await authRecord.update({
        noShowCount: 0,
        status: 'Inactive',
      });
      await this.sessionService.invalidate(authRecord.id.toString());
      await this.sendNoShowSuspensionEmails(
        employeeID,
        orgID,
        newCount,
        noShowLimit,
      );
    } else {
      await authRecord.update({ noShowCount: newCount });
    }
  }

  async sendNoShowSuspensionEmails(
    employeeID: bigint,
    orgID: bigint,
    noShowCount: number,
    configuredLimit: number,
  ): Promise<void> {
    try {
      const employee = await this.employeeService.findOne(employeeID);
      const employeeData = employee?.data;
      if (!employeeData?.email) {
        return; // nothing to send to without an email
      }
      const dateTime = moment().format('DD-MM-YYYY hh:mm A');

      const sharedData = {
        employeeName: employeeData.name,
        employeeCode: employeeData.employeeCode,
        teamName: employeeData.team?.name ?? 'N/A',
        processName: employeeData.process?.name ?? 'N/A',
        dateTime,
        noShowCount,
        configuredLimit,
      };

      // Email to the employee
      await this.emailService.sendEmail({
        mailTo: [employeeData.email],
        subject: `Action Required: Smart Router App Access Suspended – ${employeeData.name} (${employeeData.employeeCode})`,
        templateName: 'employee-noshow-suspension',
        mailBody: sharedData,
        isAttachments: false,
        attachments: [],
      });

      // Email to org admin(s)
      const admin = await this.employeeModel.findOne({
        where: { orgID: BigInt(orgID), employeeType: UserType.Admin },
        attributes: ['email'],
      });

      // const adminMailTo = [...new Set([admin?.email].filter(Boolean))];

      if (admin?.email) {
        await this.emailService.sendEmail({
          mailTo: [admin?.email],
          subject: `[ALERT] Smart Router Access Suspended: ${employeeData.name} (${employeeData.employeeCode})`,
          templateName: 'admin-alert-noshow-suspension',
          mailBody: sharedData,
          isAttachments: false,
          attachments: [],
        });
      }
    } catch (err) {
      // Don't let email failure break the actual blocking logic —
      // the employee is already correctly blocked regardless of email outcome.
      this.logger.error('Failed to send no-show suspension emails:', err);
    }
  }

  private async calculateAutoLogoutTime(
    employee: Employee,
    loginTime: string,
  ): Promise<string | null> {
    if (!loginTime) {
      return null;
    }

    const team = employee?.team;

    if (!team) {
      return null;
    }

    if (!team.isShiftEnabled) {
      return null;
    }

    if (!team.isAutoLogoutEnabled) {
      return null;
    }

    if (!team.workHours?.length) {
      return null;
    }

    const shiftLoginTimes = team.shiftLoginTime ?? [];
    const workHours = team.workHours ?? [];

    const shiftIndex = shiftLoginTimes.findIndex(
      (time) => normalizeTime(time) === normalizeTime(loginTime),
    );

    if (shiftIndex === -1) {
      return null;
    }

    const workingHours = workHours[shiftIndex];

    if (!workingHours) {
      return null;
    }

    const [loginHour, loginMinute] = loginTime.split(':').map(Number);
    const [workHour, workMinute] = workingHours.split(':').map(Number);

    const logoutMoment = moment()
      .startOf('day')
      .set({
        hour: loginHour,
        minute: loginMinute,
        second: 0,
        millisecond: 0,
      })
      .add(workHour, 'hours')
      .add(workMinute, 'minutes');

    return logoutMoment.format('HH:mm');
  }

  // This helper is used only when the resolved config is an empty string (""), which means:
  // No cutoff restriction, but never allow operations after the shift time.
  private async validatePastShift(
    selectedDates: string[],
    time: string,
    pickDrop: 'login' | 'logout',
  ) {
    const now = moment();

    for (const date of selectedDates) {
      const selectedDateTime = moment(date).set({
        hour: Number(time.split(':')[0]),
        minute: Number(time.split(':')[1]),
        second: 0,
        millisecond: 0,
      });

      if (!now.isBefore(selectedDateTime)) {
        throw new BadRequestException(
          `${pickDrop.toUpperCase()} trip cannot be created. ` +
            `The ${pickDrop} time (${selectedDateTime.format(
              'DD/MM/YYYY hh:mm A',
            )}) has already passed.`,
        );
      }
    }
  }

  private async shouldUserBypassCutoff(user: any): Promise<boolean> {
    // Check Employee table for Admin
    if (user?.employeeID) {
      const employee = await this.employeeModel.findByPk(user.employeeID, {
        attributes: ['id', 'employeeType'],
      });

      if (employee?.employeeType === EmployeeType.Admin) {
        return true;
      }
    }
    // Check Authentication table for SuperAdmin
    if (user?.id) {
      const authentication = await this.authModel.findByPk(user.id, {
        attributes: ['id', 'userType'],
      });
      if (authentication?.userType === UserType.SuperAdmin) {
        return true;
      }
    }
    return false;
  }
}
