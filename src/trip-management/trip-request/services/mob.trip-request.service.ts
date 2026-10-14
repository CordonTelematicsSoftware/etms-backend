import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from 'node_modules/@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { RequestStatus, TripStatus } from 'src/shared/enums';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { generateOTP } from 'src/shared/utils/otp.utils';
import { EmployeeService } from 'src/employee/services/employee-service';
import { Organization } from 'src/organization/models/organization.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { normalizeTime } from 'src/shared/utils/timeUtils';
import * as moment from 'moment';
import { TripService } from 'src/trip-management/trip/services/trip.service';
import { Employee } from 'src/employee/models/employee.model';
import { NotificationDispatcherService } from 'src/notifications/services/notification-dispatcher.service';
import { NotificationChannel } from 'src/notifications/enums/notification-channel.enum';
import { Profile } from 'src/profile/model/profile.model';
import { TripRequestService } from './trip-request.service';
import { MarkAttendanceViaBluetoothInput } from '../dtos/mark-attendence-bluetooth-input.dto';

@Injectable()
export class MobTripRequestService {
  private logger = new Logger(MobTripRequestService.name);
  constructor(
    @InjectModel(TripRequest)
    private tripRequestModel: typeof TripRequest,
    // @InjectModel(Employee)
    // private employeeModel: typeof Employee,
    @InjectModel(Profile)
    private profileModel: typeof Profile,
    private eventlogService: EventLogService,
    private configService: ConfigurationService,
    private employeeService: EmployeeService,
    private tripService: TripService,
    private tripRequestService: TripRequestService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  async emergencyTripUpdate(
    emergencyUpdateInput: any,
    user: any,
  ): Promise<GenericResponse<TripRequest>> {
    const { tripRequestID, emergencyType, locationType, shiftTime } =
      emergencyUpdateInput;
    const tripRequest = await this.tripRequestModel.findOne({
      where: {
        id: tripRequestID,
      },
    });

    if (!tripRequest) {
      throw new NotFoundException(`Trip request not found.`);
    }
    if (
      ![
        RequestStatus.Pending,
        RequestStatus.Approved,
        RequestStatus.Requested,
      ].includes(tripRequest.status as unknown as RequestStatus)
    ) {
      throw new NotFoundException(
        `Trip must be in pending, requested or approved status.`,
      );
    }
    const currentDate = new Date().toISOString().split('T')[0];
    const tripRequestDate = new Date(tripRequest.date)
      .toISOString()
      .split('T')[0];
    if (tripRequestDate !== currentDate) {
      throw new NotFoundException(
        `Trip request date must be equal to the current date.`,
      );
    }
    if (tripRequest.shiftTime === shiftTime) {
      throw new NotFoundException(`Please change your shift time.`);
    }
    await this.tripRequestModel.update(
      { status: RequestStatus.Cancelled }, // Assuming `Cancelled` is a valid status
      { where: { id: tripRequestID } },
    );

    const approvalType = await this.configService.getConfigValue(
      'AUTO_APPROVAL_TRIP_REQUEST',
      user?.orgID,
    );

    const employee = await this.employeeService.findOne(user?.employeeID);

    const updatedStatus =
      approvalType === 'Yes' ? RequestStatus.Approved : RequestStatus.Requested;

    const otp = generateOTP();
    const newShiftTime = normalizeTime(shiftTime);
    const newTrip = await this.tripRequestModel.create({
      orgID: user?.orgID,
      employeeID: user?.employeeID,
      employeeCode: employee?.data?.employeeCode,
      date: currentDate,
      shiftTime: newShiftTime,
      pickDrop: tripRequest?.pickDrop,
      status: updatedStatus,
      emergencyType: emergencyType, // Set emergency type
      locationType: locationType,
      locationID: employee?.data?.locationID,
      locationName: employee?.data?.location?.name,
      attendanceOtp: otp,
    });
    return {
      message: 'Emergency trip request created successfully.',
      data: newTrip,
    };
  }

  async findAll(
    user?: any,
    page?: number,
    limit?: number,
  ): Promise<PaginatedList<TripRequest>> {
    try {
      const isPaginated =
        page !== undefined &&
        page !== null &&
        limit !== undefined &&
        limit !== null &&
        !isNaN(Number(page)) &&
        !isNaN(Number(limit)) &&
        Number(page) > 0 &&
        Number(limit) > 0;

      const queryOptions: any = {
        where: {
          employeeID: user?.employeeID,
        },
        order: [['id', 'DESC']],
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
          'geoCode',
          'locationName',
          'attendanceMode',
          'attendanceLocation',
          'attendanceTime',
          'emergencyType',
          'attendance',
          'tripID',
          'deboard',
          'deboardTime',
          'safeHome',
          'officeLocation',
        ],
        include: [
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name', 'status', 'logo'],
            required: true,
          },
          {
            model: Trip,
            as: 'trip',
            attributes: ['id', 'status', 'lockStatus', 'routeNumber'],
            required: false,
          },
        ],
      };

      if (isPaginated) {
        queryOptions.limit = Number(limit);
        queryOptions.offset = (Number(page) - 1) * Number(limit);
      }

      const tripRequests = await this.tripRequestModel.findAndCountAll(
        queryOptions,
      );

      return {
        totalItems: tripRequests.count,
        items: tripRequests.rows,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async markAttendanceByQr(
    qrDataInput: any,
    user: any,
  ): Promise<GenericResponse<TripRequest>> {
    try {
      const { qrData } = qrDataInput;
      const parts = qrData.split('_');

      if (parts.length !== 4 || parts[0] !== 'cab') {
        throw new BadRequestException('Invalid QR code');
      }
      const cabID = BigInt(parts[1]);
      const qrTimestamp = new Date(parts[3]).getTime();
      if (isNaN(qrTimestamp)) {
        throw new BadRequestException('Invalid QR timestamp');
      }
      const qrExpiry = 10 * 60 * 1000;
      if (Date.now() - qrTimestamp > qrExpiry) {
        throw new BadRequestException('QR code expired');
      }

      const tripRequest = await this.tripRequestModel.findOne({
        where: {
          employeeID: BigInt(user.employeeID),
        },
        include: [
          {
            model: Trip,
            as: 'trip',
            where: {
              cabID: cabID,
              status: TripStatus.Ongoing,
            },
          },
          {
            model: Employee,
            as: 'employee',
            where: {
              id: user.employeeID,
            },
          },
        ],
      });

      if (!tripRequest) {
        throw new NotFoundException('No ongoing trip found for this employee');
      }
      if (tripRequest.attendance === true) {
        throw new BadRequestException('Attendance already marked');
      }
      // const orgAdmin = await this.employeeModel.findOne({
      //   where: {
      //     orgID: tripRequest.orgID,
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
      const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');
      const markedTime = moment().format('DD-MMM-YYYY hh:mm');
      await this.tripRequestModel.update(
        {
          attendance: true,
          attendanceMode: 'QR',
          attendanceTime: currentDateTime,
          noShow: false,
        },
        {
          where: {
            id: tripRequest.id,
          },
        },
      );

      const updatedTripRequest = await this.tripRequestModel.findByPk(
        tripRequest.id,
      );
      const trip = tripRequest.trip;
      if (trip?.employees?.length) {
        const updatedEmployees = trip.employees.map((emp) => {
          if (emp.id === user.employeeID) {
            return {
              ...emp,
              attendance: true,
              attendanceMode: 'QR',
              attendanceTime: currentDateTime,
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

      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripRequest.id,
        authID: user.id,
        updatedBy: user.name,
        payload: updatedTripRequest,
        requestPayload: tripRequest,
        customDescription: 'marked attendance via QR',
        user,
      };
      const createdEventLog = await this.eventlogService.create(eventLog);
      // if (orgAdmin) {
      //   const deviceInfoList = orgAdmin.get('employeeDeviceInfo') ?? [];
      //   const deviceInfo = deviceInfoList?.sort(
      //     (a: any, b: any) =>
      //       new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      //   )?.[0];

      //   if (deviceInfo?.deviceToken) {
      //     const payload = {
      //       organizationId: String(tripRequest.orgID),
      //       event: 'emp.mark.attendance',
      //       locale: 'en',
      //       queue: true,
      //       recipient: {
      //         id: String(orgAdmin.authInput?.id),
      //         email: orgAdmin.email,
      //         firstName: orgAdmin.name,
      //         phoneNumber: orgAdmin.phone,
      //         deviceToken: deviceInfo.deviceToken,
      //         // snsEndpointArn: deviceInfo.snsEndpointArn,
      //       },
      //       channels: [NotificationChannel.PUSH],
      //       data: {
      //         trip: tripRequest.tripID,
      //         employeeName: tripRequest.employee.name,
      //         markedTime: currentDateTime,
      //       },
      //       eventLogId: String(createdEventLog?.id),
      //     };
      //     await this.notificationDispatcher.notify(payload);
      //   }
      // }
      const employeePhone = tripRequest.employee?.phone;
      if (employeePhone) {
        const payload = {
          organizationId: String(tripRequest.orgID),
          event: 'emp.mark.attendance',
          locale: 'en',
          queue: false,
          recipient: {
            id: String(tripRequest.employeeID),
            email: tripRequest.employee?.email,
            firstName: tripRequest.employee?.name,
            phoneNumber: employeePhone,
          },
          channels: [NotificationChannel.SMS],
          data: {
            firstName: tripRequest.employee?.name,
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
        message: 'Attendance marked successfully via QR',
        data: tripRequest,
      };
    } catch (error) {
      this.logger.error('QR attendance error', error);

      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to mark attendance via QR',
      );
    }
  }

  async markAttendanceByBluetooth(
    bluetoothDataInput: MarkAttendanceViaBluetoothInput,
    user: any,
  ): Promise<GenericResponse<TripRequest>> {
    try {
      const { tripRequestID, employeeID, attendanceLocation } =
        bluetoothDataInput;

      // Fetch trip request scoped to the employee, with trip status
      const tripRequest = await this.tripRequestModel.findOne({
        where: {
          id: tripRequestID,
          employeeID: employeeID,
        },
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

      if (!tripRequest.trip || tripRequest.trip.status !== TripStatus.Ongoing) {
        throw new BadRequestException(`Your trip hasn't started yet.`);
      }

      if (tripRequest.attendance === true) {
        throw new BadRequestException('Attendance already marked');
      }

      // Validate the employee actually belongs to this trip's employee list
      // (this is the Bluetooth-flow equivalent of the PIN check — since there's
      // no secret to verify, we confirm the request maps to a real assigned
      // employee on the ongoing trip before trusting the proximity signal)
      const employeeOnTrip = tripRequest.trip?.employees?.some(
        (emp: any) => emp.id === employeeID,
      );
      if (tripRequest.trip?.employees && !employeeOnTrip) {
        throw new BadRequestException('Employee is not assigned to this trip');
      }

      const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');
      const markedTime = moment().format('DD-MMM-YYYY hh:mm');

      tripRequest.attendance = true;
      tripRequest.attendanceMode = 'Bluetooth';
      tripRequest.noShow = false;
      tripRequest.attendanceTime = currentDateTime;
      tripRequest.attendanceLocation = attendanceLocation;

      await tripRequest.save();

      // Sync Trip model's employees array
      if (tripRequest.tripID) {
        const trip = await this.tripService.findOne(Number(tripRequest.tripID));

        if (trip?.employees) {
          const updatedEmployees = trip.employees.map((emp) => {
            if (emp.id === employeeID) {
              return {
                ...emp,
                attendance: true,
                attendanceMode: 'Bluetooth',
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

      const employee = await this.employeeService.findOne(BigInt(employeeID));

      const eventLog = {
        objectType: 'Trip Request',
        changeType: 'edit',
        objectID: tripRequest.id,
        authID: user?.id,
        updatedBy: user?.name,
        payload: tripRequest,
        requestPayload: bluetoothDataInput,
        orgID: user?.orgID,
        customDescription: 'marked attendance via Bluetooth',
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
          eventLogId: String(createdEventLog?.id),
          tripID: String(tripRequest.tripID),
          empID: String(employeeID),
        };
        await this.notificationDispatcher.notify(payload);
      }

      return {
        message: 'Attendance marked successfully via Bluetooth',
        data: tripRequest,
      };
    } catch (err: any) {
      this.logger.error('Bluetooth attendance error', err);

      if (err.status) {
        throw err;
      }
      throw new InternalServerErrorException(
        'Failed to mark attendance via Bluetooth',
      );
    }
  }
}
