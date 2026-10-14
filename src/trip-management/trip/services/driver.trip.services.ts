import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from 'node_modules/@nestjs/common';
import { TripFilterInput } from '../dtos/trip-filter-input.dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Trip } from '../models/trip.model';
import { PickDrop, ReadStatus, SortOrder, TripStatus } from 'src/shared/enums';
import {
  SAFE_HOME_GENDERS_CONFIG,
  SAFE_HOME_GENDER_FALLBACK,
  isSafeHomeDisabled,
  parseSafeHomeGenders,
  readSafeHomeGenders,
} from 'src/shared/utils/safe-home-gender';
import * as moment from 'moment';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { TripActualsService } from './trip-actuals.service';
import { TripRequestService } from 'src/trip-management/trip-request/services/trip-request.service';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { Organization } from 'src/organization/models/organization.model';
import { Cab } from 'src/cabs/models/cab.model';
import { Driver } from 'src/drivers/models/driver.model';
import { Security } from 'src/security/models/security.model';
import { TripService } from './trip.service';
import { SecurityAttendance } from 'src/security/models/securityAttendance.model';
import { SmsService } from 'src/sms/services/sms.service';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { generateOTP } from 'src/shared/utils/otp.utils';
import { SecurityAttendanceDto } from '../dtos/spock-attendance-input.dto';
import { ConfigService } from 'node_modules/@nestjs/config';
import axios from 'axios';
import { GoogleMapsService } from 'src/google-maps/services/google-map-service';
import { Alert } from 'src/alerts/models/alert.model';
import {
  AddEmpByDriverInputDto,
  AddEmpByDriverOtpInputDto,
} from '../dtos/add-employee-by-driver.dto';
import { Employee } from 'src/employee/models/employee.model';
import { EmployeeTripOtp } from 'src/employee/models/employee-trip-otp.model';
import { EmployeeEstTimeCalculationService } from 'src/employee/services/employee-est-time-calculation.service';
import { OrganizationService } from 'src/organization/services/organization.service';
import { Location } from 'src/location-management/locations/models/location.model';
import { EmployeeDeviceInfo } from 'src/auth/models/employee-device-model';
import { NotificationChannel } from 'src/notifications/enums/notification-channel.enum';
import { NotificationDispatcherService } from 'src/notifications/services/notification-dispatcher.service';
import { Authentication } from 'src/auth/models/authentication.model';
import { EmployeeService } from 'src/employee/services/employee-service';
import * as bcrypt from 'bcryptjs';
import { Profile } from 'src/profile/model/profile.model';
import { MarkAttendanceViaPinInput } from '../dtos/mark-attendance-pin-input.dto';
import { IVRCallingService } from 'src/IVR-calling/service/ivr-calling.service';
import { MarkDeboardViaPinInput } from '../dtos/mark-deboard-pin-input.dto';
import { DriverOverspeedInput } from '../dtos/driver-overspeed.dto';
import { DriverOverspeed } from '../models/driver-overspeed.model';

@Injectable()
export class DriverTripService {
  private logger = new Logger(DriverTripService.name);
  constructor(
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    @InjectModel(TripRequest)
    private tripRequestModel: typeof TripRequest,
    @InjectModel(Profile)
    private profileModel: typeof Profile,
    @InjectModel(SecurityAttendance)
    private securityAttendanceModel: typeof SecurityAttendance,
    @InjectModel(Security)
    private securityModel: typeof Security,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(EmployeeTripOtp)
    private employeeTripOtpModel: typeof EmployeeTripOtp,
    @InjectModel(Alert)
    private alertModel: typeof Alert,
    @Inject(forwardRef(() => TripRequestService))
    private tripRequestService: TripRequestService,
    // private tripRequestService: TripRequestService,
    private tripActualsService: TripActualsService,
    private eventlogService: EventLogService,
    private tripService: TripService,
    private smsService: SmsService,
    private ivrService: IVRCallingService,
    private configurationService: ConfigurationService,
    private readonly sequelize: Sequelize,
    private configService: ConfigService,
    private googleMapService: GoogleMapsService,
    private employeeEstTimeCalculationService: EmployeeEstTimeCalculationService,
    private organizationService: OrganizationService,
    private readonly notificationDispatcher: NotificationDispatcherService,
    private employeeService: EmployeeService,
    @InjectModel(DriverOverspeed)
    private readonly driverOverspeedModel: typeof DriverOverspeed,
  ) {}

  async findAllAssignedTrips(
    tripFilterInput: TripFilterInput,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const {
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        date,
      } = tripFilterInput;
      const whereCondition: any = {};
      whereCondition.driverID = user?.driverID;

      if (date) {
        whereCondition.date = date;
      }
      const trips = await this.tripModel.findAndCountAll({
        where: whereCondition,
        order: [[sortBy, sortOrder]],
        attributes: [
          'id',
          'date',
          'shiftTime',
          'employees',
          'vendorCode',
          'seats',
          'estimatedOccupancy',
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
          'spock',
          'spockID',
          'orgID',
        ],
        include: [
          {
            model: Organization,
            attributes: ['id', 'name', 'email', 'phone', 'geoCode', 'logo'],
          },
          {
            model: Cab,
            attributes: ['id', 'regNo', 'rcOwner', 'color', 'model'],
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

  private formatTripDates(trips: Trip[]): Trip[] {
    return trips.map((trip) => {
      trip.setDataValue('date', moment(trip.date).format('DD/MM/YYYY') ?? null);
      return trip;
    });
  }

  async createSpocAttendanceOtp(
    tripID: string,
    user: any,
  ): Promise<GenericResponse<any>> {
    try {
      const trip = await this.tripModel.findOne({
        where: { id: tripID, status: 'Ongoing' },
      });
      if (!trip) {
        throw new Error('Trip not found or not ongoing');
      }
      if (trip.driverID !== user?.driverID) {
        throw new Error('Access denied: This trip is not associated with you.');
      }
      const security = await this.securityModel.findOne({
        where: { id: trip.spockID, orgID: trip.orgID },
      });
      if (!security) {
        throw new Error('Security not found');
      }
      const otp = generateOTP();
      const now = new Date();
      const generatedTime = now.toTimeString().split(' ')[0]; // HH:mm:ss

      const otpExpiry = await this.configurationService.getConfigValue(
        'Security attendance otp expiry',
        trip.orgID,
      );
      const expiryMins = Number(otpExpiry);
      if (isNaN(expiryMins)) {
        throw new Error('Invalid expiry minutes configured');
      }
      const expiryTime = new Date(now.getTime() + expiryMins * 60000)
        .toTimeString()
        .split(' ')[0];

      await this.securityAttendanceModel.create({
        spockID: security.id,
        tripID,
        otp,
        generatedTime,
        expiryTime,
        status: 'Pending',
        attendanceMarkedTime: null,
      });
      const smsNumber = `+91${security.phone1}`;
      const templateId = '1707174401834878667';
      const otpParams = [security.name, otp];

      await this.smsService.sendSms(smsNumber, templateId, otpParams);
      return {
        message: 'OTP has been sent to registered phone number',
        data: { otp: otp, expiryTime: expiryTime },
      };
    } catch (err: any) {
      return {
        message: err.message,
        data: null,
      };
    }
  }

  async updateSpockAttendance(
    dto: SecurityAttendanceDto,
    user: any,
  ): Promise<GenericResponse<SecurityAttendance>> {
    try {
      const { tripID, otp } = dto;
      const trip = await this.tripModel.findOne({
        where: { id: tripID, status: 'Ongoing' },
      });
      if (!trip) {
        throw new Error('Trip not found or not ongoing');
      }
      if (trip.driverID !== user?.driverID) {
        throw new Error('Access denied: This trip is not associated with you.');
      }
      const alreadyVerified = await this.securityAttendanceModel.findOne({
        where: { tripID: tripID, status: 'Marked' },
      });
      if (alreadyVerified) {
        throw new Error('Security attendance already marked');
      }
      const lastOtp = await this.securityAttendanceModel.findOne({
        where: { tripID, status: 'Pending' },
        order: [['createdAt', 'DESC']],
      });
      if (!lastOtp) {
        throw new Error('No pending OTP found for this trip');
      }
      // validate OTP match
      if (lastOtp.otp !== otp) {
        throw new Error('Invalid OTP');
      }
      // validate expiry
      const now = new Date();
      const nowStr = now.toTimeString().split(' ')[0]; // HH:mm:ss format
      if (nowStr > lastOtp.expiryTime) {
        throw new Error('OTP has expired');
      }
      await lastOtp.update({
        status: 'Marked',
        attendanceMarkedTime: nowStr,
      });
      return {
        message: 'Security attendance marked successfully',
        data: lastOtp,
      };
    } catch (err: any) {
      return {
        message: err.message,
        data: null,
      };
    }
  }

  async findOne(id: string, user: any): Promise<GenericResponse<Trip>> {
    try {
      const tripData = await this.tripModel.findOne({
        where: { id },
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
            attributes: ['id', 'name', 'email', 'phone', 'geoCode', 'logo'],
          },
          {
            model: Security,
            attributes: [
              'id',
              'name',
              'securityCode',
              'gender',
              'phone1',
              'address',
            ],
          },
        ],
      });

      if (!tripData) {
        throw new NotFoundException('Trip not found.');
      }

      if (tripData.driverID !== user?.driverID) {
        throw new InternalServerErrorException(
          'Access denied: This trip is not associated with you.',
        );
      }
      return {
        message: 'Trip retrieved successfully.',
        data: tripData,
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'An unexpected error occurred while fetching the trip.',
      );
    }
  }

  async updateDriverStatus(
    ids: string[],
    status: string,
    user: any,
  ): Promise<any> {
    try {
      const updateStatus =
        status === 'Confirm'
          ? TripStatus.Confirmed
          : status === 'Reject'
          ? TripStatus.Pending
          : status;
      const tripById = await this.tripModel.findAll({
        where: { id: { [Op.in]: ids } },
      });

      const eventPayload = JSON.parse(JSON.stringify(status));
      const eventLog = {
        objectType: 'Trip',
        changeType: 'edit',
        objectID: null,
        authID: user?.id,
        orgID: user?.orgID,
        updatedBy: user?.name,
        payload: tripById,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      const updatedTrips = await this.tripModel.update(
        {
          status: updateStatus,
          ...(status === 'Confirm' ? { acceptedAt: new Date() } : {}),
        },
        {
          where: { id: { [Op.in]: ids } },
          returning: true,
        },
      );

      return {
        message: 'Trip updated successfully',
        data: updatedTrips?.[1] ?? [],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async startTrip(id: any, user: any): Promise<any> {
    try {
      const existingTrip = await this.tripModel.findOne({
        where: { id },
        include: [
          {
            model: Cab,
            as: 'cab',
            attributes: ['regNo'],
          },
          {
            model: TripRequest,
            as: 'tripEmployees',
            attributes: ['id', 'attendanceOtp', 'pickUpTime'],
            include: [
              {
                model: Employee,
                attributes: ['id', 'name', 'email', 'phone'],
                include: [
                  {
                    model: EmployeeDeviceInfo,
                    attributes: ['deviceToken', 'createdAt'],
                  },
                  {
                    model: Authentication,
                    as: 'authInput',
                    attributes: ['id'],
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!existingTrip) {
        throw new InternalServerErrorException(
          'Unable to start the trip: Trip not found.',
        );
      }

      if (existingTrip.driverID !== user?.driverID) {
        // console.log('the ids are ---------------------->', existingTrip.driverID,user?.driverID, user);
        throw new InternalServerErrorException(
          'Unable to start the trip: You are not assigned as the driver.',
        );
      }

      if (existingTrip.cabID == null) {
        throw new InternalServerErrorException(
          'Unable to start the trip: No cab assigned to this trip.',
        );
      }

      if (existingTrip.lockStatus === 'Inactive') {
        throw new InternalServerErrorException(
          'Unable to start the trip: Trip is not locked.',
        );
      }

      const tripStarted =
        await this.tripActualsService.findTripActualDataWithTripID(id);

      if (tripStarted !== null) {
        throw new InternalServerErrorException(
          'Unable to start the trip: Trip has already been started.',
        );
      }
      const updatedTrip = await this.tripModel.update(
        { status: TripStatus.Ongoing },
        {
          where: { id },
          returning: true,
        },
      );
      const currentTime = moment().format('HH:mm:ss');
      const currentDate = moment().format('YYYY-MM-DD');

      await this.tripActualsService.create(
        {
          tripID: id,
          actualStartDate: currentDate,
          actualStartTime: currentTime,
          actualEndDate: null,
          actualEndTime: null,
          actualDistance: null,
          actualCost: null,
          billingRate: null,
        },
        user,
      );
      // const employees =
      //   existingTrip?.tripEmployees?.map((tr) => tr.employee) ?? [];
      const employees =
        existingTrip?.tripEmployees?.map((tr) => ({
          ...tr.employee.get({ plain: true }),
          attendanceOtp: tr.attendanceOtp,
          pickUpTime: tr.pickUpTime,
        })) ?? [];

      const notificationPromises = employees.map((employee: any) => {
        const deviceInfoList = employee.employeeDeviceInfo ?? [];
        const deviceInfo = deviceInfoList?.sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )?.[0];
        if (!deviceInfo?.deviceToken) return;
        const channels = deviceInfo?.deviceToken
          ? [NotificationChannel.PUSH, NotificationChannel.SMS]
          : [NotificationChannel.SMS];
        const payload = {
          organizationId: String(existingTrip.orgID),
          // event: 'trip.started',
          event:
            existingTrip.pickDrop === PickDrop.Pick
              ? 'trip.started.pick'
              : 'trip.started.drop',
          locale: 'en',
          queue: false,
          recipient: {
            id: employee.authInput.id,
            email: employee.email,
            name: employee.name,
            phoneNumber: employee.phone,
            deviceToken: deviceInfo.deviceToken,
            // snsEndpointArn: deviceInfo.snsEndpointArn,
          },
          channels,
          data: {
            name: employee.name,
            tripID: id,
            startDate: currentDate,
            startTime: currentTime,
            driverName: user?.name,
            attendanceOtp: employee.attendanceOtp,
            shiftTime: existingTrip.shiftTime,
            cabNo: existingTrip.cab?.regNo,
            ...(existingTrip.pickDrop === PickDrop.Pick && {
              pickUpTime: employee.pickUpTime,
            }),
          },
          tripID: id,
          empID: employee?.id,
        };
        return this.notificationDispatcher.notify(payload);
      });
      await Promise.all(notificationPromises.filter(Boolean));

      return {
        message: 'Trip started successfully.',
        data: updatedTrip?.[1] ?? [],
      };
    } catch (err) {
      throw new InternalServerErrorException(
        err?.message || 'An unexpected error occurred while starting the trip.',
      );
    }
  }

  async verifyEmployeeOtp(
    tripRequestID: string,
    employeeOTP: string,
    attendanceLocation: string,
    user?: any, // needed for eventLog authID/updatedBy - adjust if not available here
  ): Promise<GenericResponse<TripRequest>> {
    try {
      const tripRequest = await this.tripRequestModel.findOne({
        where: { id: tripRequestID },
        include: [
          {
            model: Trip,
            attributes: ['id', 'pickDrop', 'status'],
          },
        ],
      });
      if (!tripRequest) {
        throw new InternalServerErrorException('Trip request not found');
      }
      if (tripRequest.trip.status === TripStatus.Ongoing) {
        if (employeeOTP === tripRequest.attendanceOtp) {
          tripRequest.attendanceOtp = null;
          tripRequest.attendance = true;
          tripRequest.noShow = false;
          tripRequest.attendanceTime = moment().format('HH:mm:ss');
          tripRequest.attendanceLocation = attendanceLocation;
          await tripRequest.save();

          if (tripRequest.tripID) {
            // Find the trip that contains this employee - convert bigint to string
            const trip = await this.tripService.findOne(
              Number(tripRequest.tripID),
            );
            const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');

            if (trip && trip.employees) {
              // Update the specific employee in the employees array
              const updatedEmployees = trip.employees.map((emp) => {
                if (emp.id === tripRequest?.employeeID.toString()) {
                  return {
                    ...emp,
                    attendance: true,
                    attendanceTime: currentDateTime,
                    attendanceMode: 'OTP',
                    noShow: false,
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

          // Fetch employee details for SMS and event log
          const employee = await this.employeeService.findOne(
            BigInt(tripRequest.employeeID),
          );
          const markedTime = moment().format('DD-MMM-YYYY hh:mm');
          const eventLog = {
            objectType: 'Trip Request',
            changeType: 'edit',
            objectID: tripRequest.id,
            authID: user?.id,
            updatedBy: user?.name,
            payload: tripRequest,
            requestPayload: { tripRequestID, employeeOTP, attendanceLocation },
            customDescription: 'marked attendance via OTP',
            user,
          };
          const createdEventLog = await this.eventlogService.create(eventLog);
          const employeePhone = employee?.data?.phone;
          if (employeePhone) {
            const payload = {
              organizationId: String(tripRequest.orgID),
              event: 'emp.mark.attendance',
              locale: 'en',
              queue: false,
              recipient: {
                id: String(tripRequest.employeeID),
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
              eventLogId: String(createdEventLog?.id),
              tripID: String(tripRequest.tripID),
              empID: String(tripRequest.employeeID),
            };
            await this.notificationDispatcher.notify(payload);
          }

          return {
            message: 'OTP verification completed.',
            data: tripRequest,
          };
        } else {
          throw new InternalServerErrorException(
            `Oops! That OTP doesn't match. Please try again.`,
          );
        }
      } else {
        throw new InternalServerErrorException(`Your trip hasn't started yet.`);
      }
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }

  async markAttendanceByPin(
    pinAttendanceInput: MarkAttendanceViaPinInput,
    user?: any,
  ): Promise<GenericResponse<TripRequest>> {
    try {
      const { tripRequestID, attendanceLocation, securityPin } =
        pinAttendanceInput;
      const tripRequest = await this.tripRequestModel.findOne({
        where: { id: tripRequestID },
        include: [
          {
            model: Trip,
            attributes: ['id', 'pickDrop', 'status'],
          },
        ],
      });

      if (!tripRequest) {
        throw new NotFoundException('Trip request not found');
      }

      if (tripRequest.trip.status !== TripStatus.Ongoing) {
        throw new BadRequestException(`Your trip hasn't started yet.`);
      }

      if (tripRequest.attendance) {
        throw new BadRequestException('Attendance already marked');
      }

      // Verify Security PIN
      const profile = await this.profileModel.findOne({
        where: {
          employeeID: tripRequest.employeeID,
        },
        attributes: ['securityPin'],
      });

      if (!profile?.securityPin) {
        throw new BadRequestException('Security PIN is not set');
      }

      const isValidPin = await bcrypt.compare(securityPin, profile.securityPin);

      if (!isValidPin) {
        throw new BadRequestException('Invalid security PIN');
      }

      const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');

      tripRequest.attendance = true;
      tripRequest.attendanceMode = 'PIN';
      tripRequest.noShow = false;
      tripRequest.attendanceTime = currentDateTime;
      tripRequest.attendanceLocation = attendanceLocation;

      await tripRequest.save();

      // Update Trip employees array
      if (tripRequest.tripID) {
        const trip = await this.tripService.findOne(Number(tripRequest.tripID));

        if (trip?.employees) {
          const updatedEmployees = trip.employees.map((emp) => {
            if (emp.id === tripRequest.employeeID.toString()) {
              return {
                ...emp,
                attendance: true,
                attendanceMode: 'PIN',
                attendanceTime: currentDateTime,
                attendanceLocation,
                noShow: false,
              };
            }
            return emp;
          });

          await this.tripService.updateEmployeesArray(
            tripRequest.tripID.toString(),
            updatedEmployees,
          );
        }
      }

      const employee = await this.employeeService.findOne(
        BigInt(tripRequest.employeeID),
      );
      const markedTime = moment().format('DD-MMM-YYYY hh:mm');
      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripRequest.id,
        authID: user?.id,
        updatedBy: user?.name,
        payload: tripRequest,
        requestPayload: {
          tripRequestID,
          attendanceLocation,
        },
        customDescription: 'marked attendance via Security PIN',
        user,
      };
      const createdEventLog = await this.eventlogService.create(eventLog);
      const employeePhone = employee?.data?.phone;
      if (employeePhone) {
        const payload = {
          organizationId: String(tripRequest.orgID),
          event: 'emp.mark.attendance',
          locale: 'en',
          queue: false,
          recipient: {
            id: String(tripRequest.employeeID),
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
          eventLogId: String(createdEventLog?.id),
          tripID: String(tripRequest.tripID),
          empID: String(tripRequest.employeeID),
        };
        await this.notificationDispatcher.notify(payload);
      }

      return {
        message: 'Attendance marked successfully via Security PIN.',
        data: tripRequest,
      };
    } catch (err: any) {
      if (err.status) {
        throw err;
      }

      throw new InternalServerErrorException(
        'Failed to mark attendance via Security PIN',
      );
    }
  }

  async markDeboardByPin(
    deboardInput: MarkDeboardViaPinInput,
    user?: any,
  ): Promise<GenericResponse<TripRequest>> {
    try {
      const { tripRequestID, deboardLocation, securityPin } = deboardInput;

      const tripRequest = await this.tripRequestModel.findOne({
        where: { id: tripRequestID },
        include: [
          {
            model: Trip,
            attributes: ['id', 'pickDrop', 'status'],
          },
        ],
      });

      if (!tripRequest) {
        throw new NotFoundException('Trip request not found');
      }

      if (tripRequest.trip.status !== TripStatus.Ongoing) {
        throw new BadRequestException(`Your trip hasn't started yet.`);
      }

      if (tripRequest.deboard) {
        throw new BadRequestException('Deboard already marked');
      }
      // Verify PIN
      const profile = await this.profileModel.findOne({
        where: {
          employeeID: tripRequest.employeeID,
        },
        attributes: ['securityPin'],
      });

      if (!profile?.securityPin) {
        throw new BadRequestException('Security PIN is not set');
      }

      const isValidPin = await bcrypt.compare(securityPin, profile.securityPin);

      if (!isValidPin) {
        throw new BadRequestException('Invalid security PIN');
      }

      const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');

      // Update Trip Request
      tripRequest.deboard = true;
      tripRequest.deboardMode = 'PIN';

      tripRequest.deboardTime = currentDateTime;
      tripRequest.deboardLocation = deboardLocation;

      await tripRequest.save();

      // Update employee inside Trip
      if (tripRequest.tripID) {
        const trip = await this.tripService.findOne(Number(tripRequest.tripID));

        if (trip?.employees) {
          const updatedEmployees = trip.employees.map((emp) => {
            if (emp.id === tripRequest.employeeID.toString()) {
              return {
                ...emp,
                deboard: true,
                deboardMode: 'PIN',
                deboardTime: currentDateTime,
                deboardLocation,
              };
            }
            return emp;
          });

          await this.tripService.updateEmployeesArray(
            tripRequest.tripID.toString(),
            updatedEmployees,
          );
        }
      }

      const employee = await this.employeeService.findOne(
        BigInt(tripRequest?.employeeID),
      );

      const orgID = employee?.data?.orgID;
      // Validate deboard location against employee home point
      // The deviation check only raises an alert; a missing config must not fail
      // a deboard that has already been committed to the DB above.
      try {
        await this.validateDeboardDeviation(
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
        (await this.isSafeHomeGenderEligible(employee?.data?.gender, orgID))
      ) {
        // await this.ivrService.initiateSafeHomeIVR(employee?.data?.phone);
        this.scheduleSafeHomeIvrCheck(tripRequest.id, employee?.data?.phone, {
          tripID: tripRequest.tripID,
          orgID: employee?.data?.orgID,
          employeeID: tripRequest.employeeID,
        });
      }

      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripRequest.id,
        authID: user?.id,
        updatedBy: user?.name,
        payload: tripRequest,
        requestPayload: {
          tripRequestID,
          deboardLocation,
        },
        customDescription: 'Marked deboard via Security PIN',
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: 'Deboard marked successfully via Security PIN.',
        data: tripRequest,
      };
    } catch (err: any) {
      if (err.status) {
        throw err;
      }

      throw new InternalServerErrorException(
        'Failed to mark deboard via Security PIN',
      );
    }
  }

  // async getActiveTrip(user: any): Promise<GenericResponse<Trip>> {
  //   const currentDate = new Date().toISOString().split('T')[0]; // Format date as yyyy-mm-dd
  //   try {
  //     const activeTrips = await this.tripModel.findOne({
  //       where: {
  //         status: TripStatus.Ongoing,
  //         date: currentDate,
  //         driverID: user.driverID,
  //       },
  //       include: [
  //         //   {
  //         //     model: TripRequest,
  //         //     as: 'employeeTripRequest',
  //         //     where: {
  //         //       employeeID: user.employeeID,
  //         //     },
  //         //   },
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
  //   } catch (error: any) {
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
          driverID: user.driverID,
        },
        attributes: { exclude: ['routeCache'] },
        include: [
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
          `No active trips found for the current date.`,
        );
      }

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

  async markCabReached(
    cabReachedInput: any,
    user: any,
  ): Promise<GenericResponse<TripRequest>> {
    try {
      const { tripID, employeeID } = cabReachedInput;
      const trip = await this.tripModel.findOne({
        where: {
          id: BigInt(tripID),
          status: 'Ongoing',
        },
      });
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }
      if (trip.driverID !== user.driverID) {
        throw new NotFoundException('You are not assigned to this trip');
      }
      let pick = true;
      if (trip.pickDrop == PickDrop.Drop) {
        pick = false;
      }
      const tripRequest = await this.tripRequestModel.findOne({
        where: {
          tripID: BigInt(trip.id),
          employeeID: employeeID,
        },
      });
      if (!tripRequest) {
        throw new NotFoundException('Trip request not found for this employee');
      }
      const cabReachConfig = await this.configurationService.getConfigValue(
        'Mark cab reach',
        trip.orgID,
      );
      if (cabReachConfig !== 'On') {
        throw new BadRequestException(
          'Mark cab reach config is not enabled for this organization.',
        );
      }
      const markCabRadiusConfig =
        await this.configurationService.getConfigValue(
          'Mark_Cab_Radius_Meter',
          trip.orgID,
        );

      if (!markCabRadiusConfig) {
        throw new BadRequestException(
          'Mark cab radius config not found for this organization.',
        );
      }
      if (tripRequest.markCabReached === true) {
        throw new BadRequestException('Cab reached already marked');
      }

      if (!tripRequest.geoCode) {
        throw new BadRequestException('Employee geoCode not found');
      }

      const [empLat, empLng] = tripRequest.geoCode.split(',').map(Number);
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
      const cabLocation = locationResponse?.data?.data;
      if (!cabLocation || !cabLocation.geocode) {
        throw new BadRequestException(
          'Unable to fetch latest GPS location for this trip',
        );
      }

      const [cabLat, cabLng] = cabLocation.geocode.split(',').map(Number);

      // Calculate Distance to check if cab entered within the markCabRadiusConfig of emp location
      const distance = await this.googleMapService.haversineDistance(
        cabLat,
        cabLng,
        empLat,
        empLng,
      );
      const geoRadius = Number(markCabRadiusConfig) / 1000;
      if (distance > geoRadius) {
        return {
          message: `Vehicle outside the employee geoCode radius.`,
          data: null,
        };
      }
      // tripRequest.markCabReached = true;
      // tripRequest.cabArrivedAt = new Date();
      // await tripRequest.save();
      tripRequest.markCabReached = true;
      const cabArrivedAt = new Date();
      tripRequest.cabArrivedAt = cabArrivedAt;
      if (trip.pickDrop === 'Pick') {
        const cabWaitingTimeConfig =
          await this.configurationService.getConfigValue(
            'Cab waiting time',
            trip.orgID,
          );
        if (!cabWaitingTimeConfig) {
          throw new BadRequestException(
            'Cab waiting time config not found for this organization.',
          );
        }
        const waitingMinutes = Number(cabWaitingTimeConfig);
        const cabWaitingTime = new Date(
          cabArrivedAt.getTime() + waitingMinutes * 60 * 1000,
        );
        tripRequest.cabWaitingTime = cabWaitingTime;
      }
      await tripRequest.save();

      const employee = await this.employeeModel.findOne({
        where: { id: employeeID },
        include: [
          {
            model: EmployeeDeviceInfo,
            attributes: ['deviceToken', 'createdAt'],
          },
        ],
      });
      const deviceInfo = employee?.employeeDeviceInfo
        ?.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        ?.at(0);
      if (!deviceInfo?.deviceToken) return;
      if (employee && pick) {
        const payload = {
          organizationId: String(trip.orgID),
          event: 'cab-reached',
          locale: 'en',
          queue: false,
          recipient: {
            id: String(employee.id),
            email: employee.email,
            name: employee.name,
            phoneNumber: employee.phone,
            deviceToken: deviceInfo.deviceToken,
          },
          channels: [NotificationChannel.PUSH, NotificationChannel.SMS],
          data: {
            name: employee.name,
          },
          tripID: tripID,
          empID: String(employeeID),
        };
        this.notificationDispatcher.notify(payload);
      }

      return {
        message: 'Cab reached has marked successfully',
        data: tripRequest,
      };
    } catch (error) {
      this.logger.error('Cab reached error', error);

      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Cab failed to reach');
    }
  }

  async addEmployeeByDriverOtp(
    addEmpByDriverOtpInput: AddEmpByDriverOtpInputDto,
    user: any,
  ): Promise<GenericResponse<any>> {
    try {
      const { tripID, employeeCode } = addEmpByDriverOtpInput;
      const trip = await this.tripModel.findOne({
        where: {
          id: BigInt(tripID),
          status: 'Ongoing',
        },
      });
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }
      if (trip.driverID !== user.driverID) {
        throw new NotFoundException('You are not assigned to this trip');
      }
      const employee = await this.employeeModel.findOne({
        where: { employeeCode: employeeCode, orgID: trip.orgID },
      });

      if (!employee) {
        throw new Error(
          'Employee not found or does not belong to this organization',
        );
      }
      const tripRequest = await this.tripRequestModel.findOne({
        where: {
          tripID: BigInt(trip.id),
          employeeCode: employeeCode,
          shiftTime: trip.shiftTime,
          date: trip.date,
          status: 'Approved',
        },
      });
      if (tripRequest) {
        throw new NotFoundException(
          'Employee already has a trip scheduled for this date and shift',
        );
      }
      const otp = generateOTP();
      const now = new Date();
      const generatedTime = now.toTimeString().split(' ')[0]; // HH:mm:ss
      const expiryTime = new Date(now.getTime() + 5 * 60000) // 5 mins
        .toTimeString()
        .split(' ')[0];

      await this.employeeTripOtpModel.create({
        employeeID: employee.id,
        employeeCode: employeeCode,
        tripID: trip.id,
        orgID: employee.orgID,
        otp,
        generatedTime,
        expiryTime,
        status: 'Pending',
      });
      const smsNumber = `+91${employee.phone}`;
      const templateId = '1707174401834878667';
      const otpParams = [employee.name, otp];

      await this.smsService.sendSms(smsNumber, templateId, otpParams);
      return {
        message: 'OTP has been sent to registered phone number',
        data: { otp: otp, expiryTime: expiryTime },
      };
    } catch (error) {
      this.logger.error('Add employee to trip failed', error);

      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to add employee to trip');
    }
  }

  async addEmployeeByDriverToTrip(
    addEmpByDriverInput: AddEmpByDriverInputDto,
    user: any,
  ): Promise<GenericResponse<any>> {
    try {
      const { tripID, employeeCode, otp } = addEmpByDriverInput;

      // 1. Validate OTP
      const otpRecord = await this.employeeTripOtpModel.findOne({
        where: {
          tripID: BigInt(tripID),
          employeeCode: employeeCode,
          otp: otp,
          status: 'Pending',
        },
      });
      if (!otpRecord) {
        throw new BadRequestException('Invalid OTP');
      }
      // 2. Check otp expiry
      const now = new Date();
      const currentTime = now.toTimeString().split(' ')[0]; // HH:mm:ss
      if (currentTime > otpRecord.expiryTime) {
        await this.employeeTripOtpModel.update(
          { status: 'Expired' },
          { where: { id: otpRecord.id } },
        );
        throw new BadRequestException('OTP has expired');
      }

      const trip = await this.tripModel.findOne({
        where: { id: BigInt(tripID), status: 'Ongoing' },
      });
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }

      if (trip.driverID !== user.driverID) {
        throw new NotFoundException('You are not assigned to this trip');
      }

      //3. Seat availability check
      if (
        trip.seats !== null &&
        trip.seats !== undefined &&
        trip.estimatedOccupancy !== null &&
        trip.estimatedOccupancy !== undefined
      ) {
        if (trip.estimatedOccupancy >= trip.seats) {
          throw new BadRequestException('No vacant seat available.');
        }
      }
      const employee = await this.employeeModel.findOne({
        where: { employeeCode: employeeCode, orgID: trip.orgID },
        include: [
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
        ],
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      const configResponse =
        await this.configurationService.getMultipleConfigValues(
          ['Arrival time buffer', 'Drop time buffer', 'Cab waiting time'],
          { orgID: trip.orgID },
        );
      const {
        'Arrival time buffer': arrivalTimeBuffer,
        'Drop time buffer': dropTimeBuffer,
        'Cab waiting time': cabWaitingTimeBuffer,
      } = configResponse.data;

      const organization = await this.organizationService.findOne(
        String(trip.orgID),
      ); // for org geolocation

      // 3. Just build trip request input not created yet
      const formattedDate = moment(trip.date).format('YYYY-MM-DD');
      const createTripRequestInput = {
        loginTime: trip.pickDrop === PickDrop.Pick ? trip.shiftTime : '',
        logoutTime: trip.pickDrop === PickDrop.Drop ? trip.shiftTime : '',
        pickDrop: trip.pickDrop === PickDrop.Pick,
        emergencyType: null,
        emergencyDate: null,
        remarks: '',
        loginTime1: '',
        logoutTime1: '',
        status: 'Requested',
        selectedDates: [formattedDate],
        employeeCodes: [employee.employeeCode],
      };

      const userForEmployee = {
        employeeID: employee.id,
        employeeCode: employeeCode,
        id: employee?.id,
        orgID: trip.orgID,
        name: employee?.name,
      };

      // 4. Build existing employees array
      const existingEmployees = Array.isArray(trip.employees)
        ? trip.employees
        : [];

      // 5. Build a temporary employee json data (without tripRequestID)
      const tempEmployeeData = {
        id: employee.id,
        empCode: employee.employeeCode,
        name: employee.name,
        location: employee.location?.name,
        address: employee.address,
        landmark: employee.landmark,
        homepoint: employee.homePoint,
        commuteDistance: employee.commuteDistance,
        gender: employee.gender,
        specialConsideration: employee.specialConsideration,
      };

      const updatedEmployees = [...existingEmployees, tempEmployeeData];

      // 6. Recalculate route, distance, legs (Google Maps - outside transaction)
      let origin, destination, waypoints;
      const pickDrop = trip.pickDrop;

      if (pickDrop === PickDrop.Pick) {
        origin = updatedEmployees[0]?.homepoint;
        waypoints = updatedEmployees
          .slice(1)
          .map((emp) => emp.homepoint)
          .filter((point) => point);
        destination = organization?.data?.geoCode;
      } else {
        origin = organization?.data?.geoCode;
        waypoints = updatedEmployees
          .slice(0, updatedEmployees.length - 1)
          .map((emp) => emp.homepoint);
        destination = updatedEmployees[updatedEmployees.length - 1]?.homepoint;
      }

      const cabRouteResponse = await this.googleMapService.calculateCabRoute(
        origin,
        destination,
        waypoints,
      );

      // 7. All DB entries inside transaction(trip update, trip req create, otp status update)
      const transaction = await this.sequelize.transaction();
      try {
        // Mark OTP as Verified first
        await this.employeeTripOtpModel.update(
          { status: 'Verified' },
          { where: { id: otpRecord.id }, transaction },
        );

        // Create trip request after OTP is verified
        const tripRequest =
          await this.tripRequestService.createBatchTripRequestNew(
            createTripRequestInput,
            userForEmployee,
          );

        if (!tripRequest?.data?.id) {
          throw new InternalServerErrorException(
            'Failed to create trip request',
          );
        }

        // Now build final employee json data with tripRequestID
        const employeeData = {
          ...tempEmployeeData,
          tripRequestID: tripRequest?.data?.id,
          noShow: tripRequest?.data?.noShow,
          deboard: tripRequest?.data?.deboard ?? false,
          attendance: tripRequest?.data?.attendance ?? false,
        };

        const finalUpdatedEmployees = [...existingEmployees, employeeData];

        //Calculate estimated times with final employees
        const employeesWithEstTime =
          await this.employeeEstTimeCalculationService.calculateEmployeeEstTime(
            pickDrop,
            trip.shiftTime,
            cabRouteResponse?.legs,
            finalUpdatedEmployees,
            arrivalTimeBuffer,
            dropTimeBuffer,
            cabWaitingTimeBuffer,
          );
        const updatedOccupancy = (
          parseInt(String(trip.estimatedOccupancy ?? '0'), 10) + 1
        ).toString();

        //Update trip
        await this.tripModel.update(
          {
            employees: employeesWithEstTime,
            estimatedDistance: cabRouteResponse?.totalDistanceKm + ' km',
            routeLegs: cabRouteResponse?.legs,
            estimatedOccupancy: updatedOccupancy,
          },
          {
            where: { id: BigInt(tripID) },
            returning: true,
            transaction,
          },
        );

        //Link tripID to trip req model
        await this.tripRequestModel.update(
          { tripID: BigInt(tripID) },
          {
            where: { id: tripRequest?.data?.id },
            returning: true,
            transaction,
          },
        );

        await transaction.commit();

        return {
          message: 'Employee added to trip successfully',
          data: { employeeCode, tripID },
        };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error: any) {
      this.logger.error('Add employee to trip failed', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to add employee to trip');
    }
  }
  async isNowBetweenTimes(orgID: bigint): Promise<boolean> {
    const configResponse =
      await this.configurationService.getMultipleConfigValues(
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

  /**
   * Which genders receive the safe-home IVR call, per org. Shared by both deboard
   * paths — TripRequestService.markDeboard reaches it the same way it already
   * reaches validateDeboardDeviation and scheduleSafeHomeIvrCheck.
   *
   * getConfigValue throws when the master config row is absent, which it will be
   * until the row is inserted per environment, so the read is wrapped and degrades
   * to female-only — today's behaviour.
   */
  async isSafeHomeGenderEligible(
    gender: string,
    orgID: bigint,
  ): Promise<boolean> {
    let configValue: string = null;

    try {
      configValue = await this.configurationService.getConfigValue(
        SAFE_HOME_GENDERS_CONFIG,
        orgID,
      );
    } catch (error: any) {
      this.logger.warn(
        `Safe home gender config unavailable for org ${orgID}: ${
          error?.message
        }. Falling back to ${SAFE_HOME_GENDER_FALLBACK.join(',')}.`,
      );
    }

    // An explicit 'None' is the per-org off switch. Checked before the typo warn
    // below so a deliberate opt-out is not reported as a misconfiguration, and
    // before parseSafeHomeGenders so it bypasses the female-only fallback — the
    // fallback is what makes blank and missing keep calling.
    if (isSafeHomeDisabled(configValue)) {
      this.logger.log(
        `Safe home IVR is disabled for org ${orgID} by configuration.`,
      );

      return false;
    }

    // A non-blank value that matches nothing is a typo or wrong casing
    // ('female,male'). Silently narrowing to female-only would hide the
    // misconfiguration until an incident review.
    if (configValue?.trim() && !readSafeHomeGenders(configValue).length) {
      this.logger.warn(
        `Safe home gender config for org ${orgID} matched no known gender (value: "${configValue}"). Falling back to ${SAFE_HOME_GENDER_FALLBACK.join(
          ',',
        )}.`,
      );
    }

    return parseSafeHomeGenders(configValue).includes(gender);
  }

  async validateDeboardDeviation(
    tripRequest: TripRequest,
    employee: Employee,
    deboardLocation: any,
    orgID: bigint,
  ): Promise<void> {
    const deviationRadius = Number(
      await this.configurationService.getConfigValue(
        'DEBOARD_DEVIATION_RADIUS',
        BigInt(orgID),
      ),
    );
    const homePoint = employee?.homePoint;

    if (!homePoint || !deboardLocation) {
      return;
    }
    const [homeLat, homeLng] = homePoint.split(',').map(Number);
    const [deboardLat, deboardLng] = deboardLocation.split(',').map(Number);
    const distance = await this.googleMapService.haversineDistance(
      deboardLat,
      deboardLng,
      homeLat,
      homeLng,
    );

    const allowedRadius = deviationRadius / 1000; // Convert meters to km
    if (distance > allowedRadius) {
      const trip = await this.tripService.findOne(Number(tripRequest.tripID));
      const employeeLabel = employee?.name
        ? ` Employee: ${employee.name}${
            employee.employeeCode ? ` (${employee.employeeCode})` : ''
          }.`
        : '';
      const tripRequestLabel = tripRequest?.id
        ? ` Trip Request ID: ${tripRequest?.id}.`
        : '';
      const remarks = `Employee deboard location is not within ${deviationRadius} meters from the home point.`;
      // Create alert
      const alertData = {
        location: deboardLocation ?? null,
        remarks: `${remarks}${employeeLabel}${tripRequestLabel}`,
        tripID: trip?.id,
        orgID: trip?.orgID,
        source: 'System Generated',
        type: 'alert',
        status: ReadStatus.Pending,
        driverID: trip?.driverID ?? null,
        employeeID: tripRequest?.employeeID ?? null,
        vendorID: trip?.vendorID ?? null,
      };
      await this.alertModel.create(alertData);
    }
  }
  // New private helper — schedules the delayed safe-home check
  async scheduleSafeHomeIvrCheck(
    tripRequestID: bigint,
    employeePhone: string,
    context?: { tripID?: any; orgID?: any; employeeID?: any },
  ): Promise<void> {
    const SAFE_HOME_PIN_WINDOW_MS = 4 * 60 * 1000;

    setTimeout(async () => {
      try {
        const latestTripRequest = await this.tripRequestModel.findOne({
          where: { id: tripRequestID },
          attributes: ['id', 'safeHome'],
        });

        // If the employee never confirmed via PIN, initiate the call now.
        if (!latestTripRequest?.safeHome) {
          await this.ivrService.initiateSafeHomeIVR(employeePhone, {
            tripRequestID,
            tripID: context?.tripID,
            orgID: context?.orgID,
            employeeID: context?.employeeID,
          });
        }
      } catch (err) {
        // Log but don't throw — this runs outside the original request lifecycle
        this.logger.log('Safe home IVR check failed:', err);
      }
    }, SAFE_HOME_PIN_WINDOW_MS);
  }

  async logOverspeedEvent(
    input: DriverOverspeedInput,
    user: any,
  ): Promise<DriverOverspeed> {
    if (user?.userType !== 'Driver') {
      throw new ForbiddenException(
        'This request can only be initiated from the driver mobile app.',
      );
    }

    const trip = await this.tripModel.findOne({
      where: { id: input.tripId },
      attributes: [
        'id',
        'driverID',
        'orgID',
        'driverCode',
        'routeNumber',
        'vendorCode',
        'pickDrop',
        'status',
        'lockStatus',
        'estimatedDistance',
        'estimatedOccupancy',
        'employees',
        'shiftTime',
      ],
      include: [
        {
          model: Driver,
          as: 'driver',
          attributes: ['id', 'code', 'name'],
          required: false,
        },
        {
          model: Cab,
          as: 'cab',
          attributes: ['id', 'regNo'],
          required: false,
        },
      ],
    });

    if (!trip) {
      throw new NotFoundException(`Trip with id ${input.tripId} not found`);
    }

    if (trip.status !== TripStatus.Ongoing) {
      throw new ConflictException(
        `Cannot log overspeed event: trip ${input.tripId} is not ongoing (current status: ${trip.status}).`,
      );
    }

    if (
      input.speedLimit !== undefined &&
      input.speedLimit !== null &&
      input.currentSpeed <= input.speedLimit
    ) {
      throw new BadRequestException(
        'Something went wrong. Speed seems to be under the limit.',
      );
    }

    const employees = (trip.employees ?? []) as any[];
    const boardedEmployees = employees.filter((emp) => emp.attendance === true);

    const now = new Date();
    const resolvedDriverCode =
      trip.driverCode || (trip as any).driver?.code || null;
    const resolvedDriverName = (trip as any).driver?.name || null;

    return this.driverOverspeedModel.create({
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      tripID: trip.id,
      orgID: trip.orgID,
      driverID: trip.driverID,
      driverCode: resolvedDriverCode,
      driverName: resolvedDriverName,
      routeNumber: trip.routeNumber,
      vendorCode: trip.vendorCode,
      cabRegNo: (trip as any).cab?.regNo ?? null,
      pickDrop: trip.pickDrop,
      lockStatus: trip.lockStatus,
      estimatedDistance: trip.estimatedDistance,
      estimatedOccupancy: trip.estimatedOccupancy,
      employeeBoardedCount: boardedEmployees.length,
      location: input.location,
      currentSpeed: input.currentSpeed,
      speedLimit: input.speedLimit,
      shiftTime: trip.shiftTime,
      empCodes: boardedEmployees.map((emp) => emp.empCode),
    });
  }
}
