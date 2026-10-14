/* eslint-disable no-console, no-unused-vars */
import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Alert } from '../models/alert.model';
import { AlertCreateFilterInput } from '../dtos/create-alert-input.dto';
import { AlertFilterInput } from '../dtos/alert-filter-input.dto';
import { Employee } from '../../employee/models/employee.model';
import { Driver } from 'src/drivers/models/driver.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { ReadStatus, SortOrder, TripStatus } from 'src/shared/enums';
import { Organization } from 'src/organization/models/organization.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { Cab } from 'src/cabs/models/cab.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
// import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
// import { Alert } from '../models/alert.model';
import { NotificationDispatcherService } from 'src/notifications/services/notification-dispatcher.service';
import { NotificationChannel } from 'src/notifications/enums/notification-channel.enum';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import * as moment from 'moment';
import 'moment-timezone';
import { SosGateway } from '../gateways/sos.gateway';
import { EmailService } from 'src/email/email.service';
import { CordonGpsApiService } from 'src/cordon-gps/services/cordon-gps-api.service';
import { CordonPanicRecord } from 'src/cordon-gps/interfaces/cordon-gps.interfaces';

@Injectable()
export class AlertService {
  private logger = new Logger(AlertService.name);

  constructor(
    @InjectModel(Alert)
    private readonly alertModel: typeof Alert,
    @InjectModel(Trip)
    private readonly tripModel: typeof Trip,
    @InjectModel(Driver)
    private readonly driverModel: typeof Driver,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    private eventlogService: EventLogService,
    private readonly notificationDispatcher: NotificationDispatcherService,
    private readonly configurationService: ConfigurationService,
    private readonly sosGateway: SosGateway,
    private readonly emailService: EmailService,
    private readonly cordonGpsApiService: CordonGpsApiService,
  ) {}

  // Helper method to fetch and validate trip details
  private async validateTripAndUser(tripID: string, user: any): Promise<Trip> {
    if (!tripID) {
      throw new BadRequestException('Trip ID is required for creating alerts');
    }

    const trip = await this.tripModel.findByPk(tripID, {
      include: [
        {
          model: Organization,
          as: 'org',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Driver,
          as: 'driver',
          attributes: ['id', 'name', 'code'],
        },
        {
          model: Cab,
          as: 'cab',
          attributes: ['id', 'regNo', 'model'],
        },
      ],
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    // Validate user belongs to this trip
    const isDriver = user?.userType === 'driver' || user?.driverID;
    const isEmployee = !isDriver;

    if (isDriver) {
      // Check if this driver is assigned to this trip
      if (trip.driverID !== (user?.driverID || user?.id)) {
        throw new ForbiddenException('You are not assigned to this trip');
      }
    } else if (isEmployee) {
      // Check if this employee is part of this trip
      const employeeInTrip = trip.employees?.some(
        (emp) => emp.id === (user?.employeeID || user?.id),
      );

      if (!employeeInTrip) {
        throw new ForbiddenException('You are not part of this trip');
      }
    }

    return trip;
  }

  // Helper method to send SOS SMS to all configured recipients
  private async sendSosNotifications(
    createAlertInput: AlertCreateFilterInput,
    orgID: any,
    user: any,
    empID: any,
    source: 'Driver' | 'Employee',
    vehicleNumber: string | null,
  ): Promise<void> {
    this.logger.log(
      `[SOS SMS] sendSosNotifications called — orgID: ${orgID}, type: ${typeof orgID}`,
    );
    try {
      const recipientsConfig = await this.configurationService.getConfigValue(
        'SOS SMS Recipients',
        orgID,
      );

      if (!recipientsConfig) {
        this.logger.warn(
          `[SOS SMS] No SOS SMS Recipients configured for org ${orgID}. Skipping.`,
        );
        return;
      }

      const phoneNumbers = recipientsConfig
        .split(',')
        .map((phone) => phone.trim())
        .filter((phone) => phone.length > 0);

      if (phoneNumbers.length === 0) {
        this.logger.warn(
          `[SOS SMS] Empty recipients list for org ${orgID}. Skipping.`,
        );
        return;
      }

      const dateTime = (moment as any)().format('DD/MM/YYYY HH:mm');

      let raisedBy: string;

      if (source === 'Driver') {
        raisedBy = `Driver - ${user?.name} (${user?.driverID || user?.id})`;
      } else {
        // Fetch fresh employee name directly from DB instead of relying on session data
        const employee = await this.employeeModel.findOne({
          where: { id: empID },
          attributes: ['id', 'name', 'employeeCode'],
        });
        const empName = employee?.name || user?.name || 'Unknown';
        // const empCode = employee?.employeeCode || empID;
        raisedBy = `Employee - ${empName} (${empID})`; // raisedBy = `Employee - ${empName} (${empCode})`;
      }

      const trackLink = `https://maps.google.com/?q=${createAlertInput.location}`;

      await Promise.all(
        phoneNumbers.map((phone) => {
          const payload = {
            organizationId: String(orgID),
            event: 'sos',
            locale: 'en',
            queue: false,
            recipient: {
              id: `91${phone}`,
              phoneNumber: `91${phone}`,
            },
            channels: [NotificationChannel.SMS],
            data: {
              raisedBy,
              tripID: createAlertInput.tripID,
              dateTime,
              vehicle: vehicleNumber || 'N/A',
              location: createAlertInput.location,
              trackLink: 'N/A',
            },
            tripID: createAlertInput.tripID,
            empID: empID ?? null,
          };

          this.logger.log(
            `[SOS SMS] Dispatching notification — organizationId: "${payload.organizationId}", phone: "91${phone}", event: "${payload.event}"`,
          );
          return this.notificationDispatcher.notify(payload);
        }),
      );

      this.logger.log(
        `[SOS SMS] All notifications dispatched successfully for org ${orgID}`,
      );
      // email
      try {
        const emailRecipientsConfig =
          await this.configurationService.getConfigValue(
            'SOS Email Alert Recipients',
            orgID,
          );

        if (!emailRecipientsConfig) {
          this.logger.warn(
            `[SOS EMAIL] No SOS Email Alert recipients configured for org ${orgID}. Skipping.`,
          );
          return;
        }

        const emailRecipients = emailRecipientsConfig
          .split(',')
          .map((email) => email.trim())
          .filter((email) => email.length > 0);

        if (emailRecipients.length === 0) {
          this.logger.warn(
            `[SOS EMAIL] Empty email recipients list for org ${orgID}. Skipping.`,
          );
          return;
        }

        await this.emailService.sendEmail({
          mailTo: emailRecipients,
          subject: 'SOS Alert Raised',
          templateName: 'sos-alert',
          mailBody: {
            raisedBy,
            tripID: createAlertInput.tripID,
            dateTime,
            vehicle: vehicleNumber || 'N/A',
            location: createAlertInput.location,
            trackLink,
          },
          isAttachments: false,
          attachments: [],
        });

        this.logger.log(
          `[SOS EMAIL] SOS email alert sent successfully for org ${orgID}`,
        );
      } catch (error) {
        this.logger.error(
          `[SOS EMAIL] Failed to send SOS email alert for org ${orgID}:`,
          error,
        );
      }
    } catch (error) {
      this.logger.error(
        `[SOS SMS] Failed to send SOS notifications for org ${orgID}:`,
        error,
      );
    }
  }

  // Admin Alert Methods
  async createAdminAlert(
    createAlertInput: AlertCreateFilterInput,
    user: any,
  ): Promise<GenericResponse<Alert>> {
    try {
      this.logger.log('Creating admin alert');

      let tripDetails = null;
      let orgID = user?.orgID;

      // If tripID is provided, validate and get trip details
      if (createAlertInput.tripID) {
        tripDetails = await this.validateTripAndUser(
          createAlertInput.tripID,
          user,
        );
        orgID = tripDetails.orgID; // Use trip's organization
      }

      const alertData = {
        ...createAlertInput,
        source: 'Employee',
        employeeID: user?.employeeID || user?.id,
        tripID: createAlertInput.tripID || null,
        orgID: orgID,
        type: createAlertInput.type || 'alert',
      };

      const alert = await this.alertModel.create(alertData);

      // Event logging
      const eventPayload = JSON.parse(JSON.stringify(createAlertInput));
      const eventLog = {
        objectType: 'Alert',
        changeType: 'add',
        objectID: alert.id,
        authID: user?.id,
        orgID: orgID,
        updatedBy: user?.name,
        payload: alert,
        requestPayload: eventPayload,
        customDescription: createAlertInput.tripID
          ? `Alert raised for Trip #${
              tripDetails?.routeNumber || createAlertInput.tripID
            }`
          : 'General alert created',
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Alert created successfully',
        data: alert,
      };
    } catch (error: any) {
      this.logger.error('Error creating admin alert:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create alert');
    }
  }

  async findAllAdminAlerts(
    user: any,
    filterInput?: AlertFilterInput,
  ): Promise<PaginatedList<Alert>> {
    try {
      this.logger.log('Fetching admin alerts');

      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
      } = filterInput || {};

      // Build where conditions - orgID filtering is enforced inside buildWhereConditions
      const whereConditions = this.buildWhereConditions(filterInput, user);

      const { count, rows } = await this.alertModel.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'name', 'employeeCode', 'email', 'phone'],
          },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code', 'email', 'phone'],
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'id',
              'routeNumber',
              'date',
              'shiftTime',
              'status',
              'pickDrop',
            ],
            include: [
              {
                model: Organization,
                as: 'org',
                attributes: ['id', 'name', 'email'],
              },
              {
                model: Driver,
                as: 'driver',
                attributes: ['id', 'name', 'code'],
              },
              {
                model: Cab,
                as: 'cab',
                attributes: ['id', 'regNo', 'model'],
              },
              {
                model: Vendor,
                as: 'vendor',
                attributes: ['id', 'name', 'code'],
              },
            ],
          },
        ],
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
      });

      // Event logging for list view
      const eventLog = {
        objectType: 'Alert',
        changeType: 'list',
        objectID: null,
        authID: user?.id,
        orgID: user?.orgID,
        updatedBy: user?.name,
        payload: { count },
        requestPayload: filterInput,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        totalItems: count,
        items: rows,
      };
    } catch (error: any) {
      this.logger.error('Error fetching admin alerts:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch alerts');
    }
  }

  async findCordonPanicAlerts(user: any): Promise<PaginatedList<any>> {
    const orgID = user?.orgID;
    const now = moment.tz('Asia/Kolkata');
    const to = now.format('YYYY-MM-DD HH:mm:ss');
    const from = now.clone().subtract(7, 'days').format('YYYY-MM-DD HH:mm:ss');

    const records = await this.cordonGpsApiService.getPanicHistory(
      orgID,
      from,
      to,
    );

    const seen = new Set<string>();
    const deduped: CordonPanicRecord[] = [];
    for (const record of records) {
      const key = `${record.imei}|${record.datetime.slice(0, 16)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(record);
    }

    const items = deduped
      .map((record) => this.mapCordonPanicRecordToAlert(record))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return {
      totalItems: items.length,
      items,
    };
  }

  private mapCordonPanicRecordToAlert(record: CordonPanicRecord) {
    return {
      id: `cordon-${record.imei}-${record.datetime}`,
      type: 'sos',
      source: 'Cordon',
      remarks: `Panic alert from vehicle ${record.rto} at ${record.datetime}`,
      location: this.extractLatLngFromCordonMessage(record.message),
      createdAt: record.datetime,
      status: ReadStatus.Pending,
      tripID: null,
      employeeID: null,
      driverID: null,
      vendorID: null,
      orgID: null,
    };
  }

  private extractLatLngFromCordonMessage(message: string): string | null {
    const match = message?.match(/maps\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    return match ? `${match[1]},${match[2]}` : null;
  }

  // Driver Alert Methods
  async createDriverAlert(
    createAlertInput: AlertCreateFilterInput,
    user: any,
  ): Promise<GenericResponse<Alert>> {
    try {
      this.logger.log('Creating driver alert');
      const isDriver = user?.userType === 'driver' || user?.driverID;
      if (!isDriver) {
        throw new ForbiddenException('Only driver can access this enpoint.');
      }
      let tripDetails = null;
      let orgID = user?.orgID;

      // If tripID is provided, validate and get trip details
      if (createAlertInput.tripID) {
        tripDetails = await this.validateTripAndUser(
          createAlertInput.tripID,
          user,
        );
        if (tripDetails.status !== TripStatus.Ongoing) {
          throw new BadRequestException(
            'Alert can only be raised for an ongoing trip',
          );
        }
        orgID = tripDetails.orgID; // Use trip's organization
      }

      // Fetch driver's vendorID for vendor room emit
      const driver = await this.driverModel.findOne({
        where: { id: user?.driverID },
        attributes: ['vendorID'],
      });

      const alertData = {
        ...createAlertInput,
        source: 'Driver',
        driverID: user?.driverID || user?.id,
        tripID: createAlertInput.tripID || null,
        orgID: orgID,
        type: 'sos',
        vendorID: driver?.vendorID || null,
      };

      const alert = await this.alertModel.create(alertData);

      // Event logging
      const eventPayload = JSON.parse(JSON.stringify(createAlertInput));
      const eventLog = {
        objectType: 'Alert',
        changeType: 'add',
        objectID: alert.id,
        authID: user?.id,
        orgID: orgID,
        updatedBy: user?.name,
        payload: alert,
        requestPayload: eventPayload,
        customDescription: createAlertInput.tripID
          ? `Alert raised for Trip #${
              tripDetails?.routeNumber || createAlertInput.tripID
            }`
          : 'General alert created',
        user,
      };
      this.eventlogService.create(eventLog);

      const sosData = {
        alertId: String(alert.id),
        source: 'Driver',
        location: createAlertInput.location,
        remarks: createAlertInput.remarks,
        tripID: createAlertInput.tripID,
        orgID: String(orgID),
        createdAt: new Date().toISOString(),
      };

      this.logger.log(
        `[SOS] Triggering SOS emit — alertID: ${alert.id}, orgID: ${orgID}, source: Driver`,
      );
      this.sosGateway.emitSosAlert(String(orgID), sosData);

      if (driver?.vendorID) {
        this.logger.log(
          `[SOS] Also emitting to vendor room — vendorID: ${driver.vendorID}`,
        );
        this.sosGateway.emitSosAlertToVendor(String(driver.vendorID), sosData);
      }
      // send SOS SMS here
      await this.sendSosNotifications(
        createAlertInput,
        orgID,
        user,
        null,
        'Driver',
        tripDetails?.cab?.regNo ?? null,
      );

      return {
        message: 'Alert created successfully',
        data: alert,
      };
    } catch (error: any) {
      this.logger.error('Error creating driver alert:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create alert');
    }
  }

  async findAllDriverAlerts(
    user: any,
    filterInput?: AlertFilterInput,
  ): Promise<PaginatedList<Alert>> {
    try {
      this.logger.log('Fetching driver alerts');

      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
      } = filterInput || {};

      const whereConditions = this.buildWhereConditions(filterInput, user);

      // Filter to show only driver's own alerts
      whereConditions.driverID = user?.driverID || user?.id;

      const { count, rows } = await this.alertModel.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code', 'email', 'phone'],
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'id',
              'routeNumber',
              'date',
              'shiftTime',
              'status',
              'pickDrop',
            ],
            include: [
              {
                model: Organization,
                as: 'org',
                attributes: ['id', 'name', 'email'],
              },
              {
                model: Cab,
                as: 'cab',
                attributes: ['id', 'regNo', 'model'],
              },
            ],
          },
        ],
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
      });

      // Event logging for list view
      const eventLog = {
        objectType: 'Alert',
        changeType: 'list',
        objectID: null,
        authID: user?.id,
        orgID: user?.orgID,
        updatedBy: user?.name,
        payload: { count },
        requestPayload: filterInput,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        totalItems: count,
        items: rows,
      };
    } catch (error: any) {
      this.logger.error('Error fetching driver alerts:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch alerts');
    }
  }

  // Mobile Alert Methods
  async createMobileAlert(
    createAlertInput: AlertCreateFilterInput,
    user: any,
  ): Promise<GenericResponse<Alert>> {
    try {
      this.logger.log('Creating mobile alert');

      // Determine if user is employee or driver based on user data
      const isDriver = user?.userType === 'driver' || user?.driverID;
      if (isDriver) {
        throw new ForbiddenException('Driver can not access this endpoint');
      }
      let tripDetails = null;
      let orgID = user?.orgID;

      // If tripID is provided, validate and get trip details
      if (createAlertInput.tripID) {
        tripDetails = await this.validateTripAndUser(
          createAlertInput.tripID,
          user,
        );
        if (tripDetails.status !== TripStatus.Ongoing) {
          throw new BadRequestException(
            'Alert can only be raised for an ongoing trip',
          );
        }
        orgID = tripDetails.orgID; // Use trip's organization
      }

      const alertData = {
        ...createAlertInput,
        source: isDriver ? 'Driver' : 'Employee',
        employeeID: !isDriver ? user?.employeeID || user?.id : null,
        driverID: isDriver ? user?.driverID || user?.id : null,
        tripID: createAlertInput.tripID || null,
        orgID: orgID,
        type: 'sos',
        // triggerType: 'SOS',
      };

      const alert = await this.alertModel.create(alertData);

      // Event logging
      const eventPayload = JSON.parse(JSON.stringify(createAlertInput));
      const eventLog = {
        objectType: 'Alert',
        changeType: 'add',
        objectID: alert.id,
        authID: user?.id,
        orgID: orgID,
        updatedBy: user?.name,
        payload: alert,
        requestPayload: eventPayload,
        customDescription: createAlertInput.tripID
          ? `Alert raised for Trip #${
              tripDetails?.routeNumber || createAlertInput.tripID
            }`
          : 'General alert created',
        user,
      };
      this.eventlogService.create(eventLog);

      const sosData = {
        alertId: String(alert.id),
        source: isDriver ? 'Driver' : 'Employee',
        location: createAlertInput.location,
        remarks: createAlertInput.remarks,
        tripID: createAlertInput.tripID,
        orgID: String(orgID),
        createdAt: new Date().toISOString(),
      };

      this.logger.log(
        `[SOS] Triggering SOS emit — alertID: ${
          alert.id
        }, orgID: ${orgID}, source: ${isDriver ? 'Driver' : 'Employee'}`,
      );
      this.sosGateway.emitSosAlert(String(orgID), sosData);

      if (isDriver && user?.driverID) {
        const driver = await this.driverModel.findOne({
          where: { id: user?.driverID },
          attributes: ['vendorID'],
        });
        if (driver?.vendorID) {
          this.logger.log(
            `[SOS] Also emitting to vendor room — vendorID: ${driver.vendorID}`,
          );
          this.sosGateway.emitSosAlertToVendor(
            String(driver.vendorID),
            sosData,
          );
        }
      }
      // send SOS SMS here
      await this.sendSosNotifications(
        createAlertInput,
        orgID,
        user,
        user?.employeeID,
        isDriver ? 'Driver' : 'Employee',
        tripDetails?.cab?.regNo ?? null,
      );

      return {
        message: 'Alert created successfully',
        data: alert,
      };
    } catch (error: any) {
      this.logger.error('Error creating mobile alert:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create alert');
    }
  }

  async findAllMobileAlerts(
    user: any,
    filterInput?: AlertFilterInput,
  ): Promise<PaginatedList<Alert>> {
    try {
      this.logger.log('Fetching mobile alerts');

      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
      } = filterInput || {};

      const whereConditions = this.buildWhereConditions(filterInput, user);

      // Filter to show only user's own alerts
      const isDriver = user?.userType === 'driver' || user?.driverID;
      if (isDriver) {
        whereConditions.driverID = user?.driverID || user?.id;
      } else {
        whereConditions.employeeID = user?.employeeID || user?.id;
      }

      const { count, rows } = await this.alertModel.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'name', 'employeeCode', 'email', 'phone'],
          },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code', 'email', 'phone'],
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'id',
              'routeNumber',
              'date',
              'shiftTime',
              'status',
              'pickDrop',
            ],
            include: [
              {
                model: Organization,
                as: 'org',
                attributes: ['id', 'name', 'email'],
              },
              {
                model: Cab,
                as: 'cab',
                attributes: ['id', 'regNo', 'model'],
              },
            ],
          },
        ],
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
      });

      // Event logging for list view
      const eventLog = {
        objectType: 'Alert',
        changeType: 'list',
        objectID: null,
        authID: user?.id,
        orgID: user?.orgID,
        updatedBy: user?.name,
        payload: { count },
        requestPayload: filterInput,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        totalItems: count,
        items: rows,
      };
    } catch (error: any) {
      this.logger.error('Error fetching mobile alerts:', error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch alerts');
    }
  }

  // Find single alert method
  async findOne(id: string, user: any): Promise<GenericResponse<Alert>> {
    try {
      const alertData = await this.alertModel.findOne({
        where: {
          id,
          orgID: user?.orgID, // Ensure user can only access alerts from their organization
        },
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'name', 'employeeCode', 'email', 'phone'],
          },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code', 'email', 'phone'],
          },
          {
            model: Trip,
            as: 'trip',
            attributes: [
              'id',
              'routeNumber',
              'date',
              'shiftTime',
              'status',
              'pickDrop',
              'employees',
            ],
            include: [
              {
                model: Organization,
                as: 'org',
                attributes: ['id', 'name', 'email'],
              },
              {
                model: Driver,
                as: 'driver',
                attributes: ['id', 'name', 'code'],
              },
              {
                model: Cab,
                as: 'cab',
                attributes: ['id', 'regNo', 'model'],
              },
            ],
          },
        ],
      });

      if (!alertData) {
        throw new NotFoundException('Alert not found.');
      }

      // Event logging for view
      const eventLog = {
        objectType: 'Alert',
        changeType: 'view',
        objectID: alertData.id,
        authID: user?.id,
        orgID: user?.orgID,
        updatedBy: user?.name,
        payload: alertData,
        requestPayload: { id },
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Alert retrieved successfully.',
        data: alertData,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'An unexpected error occurred while fetching the alert.',
      );
    }
  }

  // Helper method to build where conditions for filtering
  private buildWhereConditions(filterInput?: AlertFilterInput, user?: any) {
    const whereConditions: any = {};

    //all those alerts which are not read
    whereConditions.status = ReadStatus.Pending;

    // Always filter by user's organization - ignore any orgID from filter input
    // Organization admins can only see their own organization's alerts
    if (user?.orgID) {
      whereConditions.orgID = user?.orgID;
    }

    if (filterInput) {
      if (filterInput.type) {
        whereConditions.type = filterInput.type;
      }

      if (filterInput?.employeeID) {
        whereConditions.employeeID = BigInt(filterInput.employeeID);
      }

      if (filterInput.source) {
        whereConditions.source = filterInput.source;
      }

      if (filterInput.tripID) {
        whereConditions.tripID = filterInput.tripID;
      }

      if (filterInput?.vendorID) {
        whereConditions.vendorID = BigInt(filterInput.vendorID);
      }

      if (filterInput.search) {
        whereConditions[Op.or] = [
          {
            location: {
              [Op.iLike]: `%${filterInput.search}%`,
            },
          },
          {
            remarks: {
              [Op.iLike]: `%${filterInput.search}%`,
            },
          },
        ];
      }

      if (filterInput.startDate || filterInput.endDate) {
        const dateConditions: any = {};

        if (filterInput.startDate) {
          dateConditions[Op.gte] = new Date(filterInput.startDate);
        }

        if (filterInput.endDate) {
          const endDate = new Date(filterInput.endDate);
          endDate.setHours(23, 59, 59, 999);
          dateConditions[Op.lte] = endDate;
        }

        whereConditions.createdAt = dateConditions;
      }
    }

    return whereConditions;
  }

  async statusUpdate(
    id: string,
    updateInput: {
      acknowledgedDate: Date;
      acknowledgedTime: string;
      comments: string;
    },
  ): Promise<GenericResponse<Alert>> {
    try {
      const [affectedCount, updatedRows] = await this.alertModel.update(
        {
          acknowledgedDate: updateInput.acknowledgedDate,
          acknowledgedTime: updateInput.acknowledgedTime,
          comments: updateInput.comments,
          status: ReadStatus.Closed,
        },
        {
          where: { id },
          returning: true,
        },
      );

      if (affectedCount === 0) {
        return {
          message: 'No alert found with the given id',
          status: false,
        };
      }

      return {
        message: 'Notification marked read successfully',
        status: true,
        data: updatedRows[0],
      };
    } catch (err) {
      return {
        message: 'Error while updating notification',
        status: false,
      };
    }
  }
}
