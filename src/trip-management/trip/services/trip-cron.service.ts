import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Trip } from '../models/trip.model';
import { PickDrop, ReadStatus, TripStatus } from 'src/shared/enums';
import { Op } from 'sequelize';
import * as moment from 'moment';
import sequelize from 'sequelize';
import { ConfigurationMaster } from 'src/config-management/config/models/config.model';
import { CompanyConfiguration } from 'src/config-management/company-config/models/company-config.model';
import { Organization } from 'src/organization/models/organization.model';
import { Alert } from 'src/alerts/models/alert.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { TripActual } from '../models/trip-actual.model';

const NOT_ACCEPTED_REMARK = 'Driver has not accepted the trip';
const NOT_STARTED_REMARK = 'Driver has not started the trip';

const ACCEPT_TIMEOUT_CONFIG = 'Trip accept timeout';
const NOT_STARTED_TIMEOUT_CONFIG_PICK = 'Trip not started timeout (Pick)'; // create in Config UI, HH:MM format
const NOT_STARTED_TIMEOUT_CONFIG_DROP = 'Trip not started timeout (Drop)'; // create in Config UI, HH:MM format
const DRIVER_ACCEPTANCE_CONFIG = 'Driver trip acceptance';

@Injectable()
export class TripCronService {
  private readonly logger = new Logger(TripCronService.name);
  constructor(
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    @InjectModel(Alert)
    private alertModel: typeof Alert,
    @InjectModel(ConfigurationMaster)
    private configModel: typeof ConfigurationMaster,
    @InjectModel(CompanyConfiguration)
    private readonly companyConfigModel: typeof CompanyConfiguration,
  ) {}

  @Cron('*/1 * * * *')
  async handleTripCron() {
    this.logger.log('----- Running Trip Cron----');
    await this.handleDriverNotAcceptedAlert();
    await this.handleDriverNotStartedAlert();
  }

  // Parses a "HH:MM" duration string (e.g. "08:00", "01:30") into total minutes.
  // Returns null if missing/malformed, so callers can skip that trip/org safely.
  private parseDurationToMinutes(value: string): number | null {
    if (!value) return null;
    const match = /^(\d{1,3}):([0-5]\d)$/.exec(value.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours * 60 + minutes;
  }

  // Anchor for the NOT ACCEPTED alert: Pick -> first employee's cabArrivalTime,
  // Drop -> trip.shiftTime (Logout Time).
  private getNotAcceptedAnchor(trip: any): moment.Moment | null {
    if (trip.pickDrop === PickDrop.Pick) {
      if (!trip.employees || !trip.employees.length) return null;
      const firstEmployee = trip.employees[0];
      if (!firstEmployee.cabArrivalTime) return null;
      return moment(
        `${trip.date} ${firstEmployee.cabArrivalTime}`,
        'YYYY-MM-DD HH:mm',
      );
    }
    if (trip.pickDrop === PickDrop.Drop) {
      if (!trip.shiftTime) return null;
      return moment(`${trip.date} ${trip.shiftTime}`, 'YYYY-MM-DD HH:mm');
    }
    return null;
  }

  // Anchor for the NOT STARTED alert: always trip.shiftTime —
  // Login Time for Pick, Logout Time for Drop.
  private getNotStartedAnchor(trip: any): moment.Moment | null {
    if (!trip.shiftTime) return null;
    return moment(`${trip.date} ${trip.shiftTime}`, 'YYYY-MM-DD HH:mm');
  }

  // Driver assigned but hasn't accepted yet.
  private async handleDriverNotAcceptedAlert() {
    const trips = await this.tripModel.findAll({
      where: {
        status: TripStatus.Pending,
        driverID: { [Op.ne]: null },
        date: {
          [Op.in]: [
            moment().format('YYYY-MM-DD'),
            moment().add(1, 'day').format('YYYY-MM-DD'),
          ],
        },
      },
      include: [
        {
          model: Organization,
          attributes: ['id', 'name', 'geoCode'],
        },
      ],
    });
    if (!trips.length) return;

    const orgIDs = trips.map((trip) => trip.orgID);
    let timeoutConfigMap: Map<string, string>;
    let driverAcceptanceConfigMap: Map<string, string>;
    try {
      timeoutConfigMap = await this.getConfigMapForOrgs(
        orgIDs,
        ACCEPT_TIMEOUT_CONFIG,
      );
      driverAcceptanceConfigMap = await this.getConfigMapForOrgs(
        orgIDs,
        DRIVER_ACCEPTANCE_CONFIG,
      );
    } catch (error) {
      this.logger.error(
        'Not-accepted cron aborted: config lookup failed',
        error,
      );
      return;
    }

    const now = moment();
    for (const trip of trips) {
      const driverAcceptanceValue = driverAcceptanceConfigMap.get(
        String(trip.orgID),
      );
      if (
        !driverAcceptanceValue ||
        driverAcceptanceValue.toLowerCase() !== 'on'
      )
        continue;

      const configValue = timeoutConfigMap.get(String(trip.orgID));
      const configMinutes = this.parseDurationToMinutes(configValue);
      if (configMinutes === null) continue;

      const anchor = this.getNotAcceptedAnchor(trip);
      if (!anchor) continue;

      // Not Accepted stays "before anchor" for both trip types — unchanged.
      const alertTime = anchor.clone().subtract(configMinutes, 'minutes');

      if (now.isSameOrAfter(alertTime)) {
        const existingAlert = await this.alertModel.findOne({
          where: {
            tripID: trip.id,
            orgID: trip.orgID,
            source: 'System Generated',
            remarks: NOT_ACCEPTED_REMARK,
            status: { [Op.in]: [ReadStatus.Pending, ReadStatus.Closed] },
          },
        });
        if (!existingAlert) {
          await this.createCronAlert(trip, NOT_ACCEPTED_REMARK);
        }
      }
    }
  }

  // Driver has not started the trip, regardless of accept status.
  // Pick: fires <config> BEFORE shiftTime (Login Time) — unchanged.
  // Drop: fires <config> AFTER shiftTime (Logout Time) — new, per client.
  // Pick and Drop use separate configs.
  private async handleDriverNotStartedAlert() {
    const trips = await this.tripModel.findAll({
      where: {
        status: { [Op.in]: [TripStatus.Pending, TripStatus.Confirmed] },
        driverID: { [Op.ne]: null },
        date: {
          [Op.in]: [
            moment().format('YYYY-MM-DD'),
            moment().add(1, 'day').format('YYYY-MM-DD'),
          ],
        },
      },
      include: [
        { model: Organization, attributes: ['id', 'name', 'geoCode'] },
        { model: TripActual, as: 'tripActual', required: false },
      ],
    });
    if (!trips.length) return;

    const orgIDs = trips.map((trip) => trip.orgID);
    let pickTimeoutConfigMap: Map<string, string>;
    let dropTimeoutConfigMap: Map<string, string>;
    let driverAcceptanceConfigMap: Map<string, string>;
    try {
      pickTimeoutConfigMap = await this.getConfigMapForOrgs(
        orgIDs,
        NOT_STARTED_TIMEOUT_CONFIG_PICK,
      );
      dropTimeoutConfigMap = await this.getConfigMapForOrgs(
        orgIDs,
        NOT_STARTED_TIMEOUT_CONFIG_DROP,
      );
      driverAcceptanceConfigMap = await this.getConfigMapForOrgs(
        orgIDs,
        DRIVER_ACCEPTANCE_CONFIG,
      );
    } catch (error) {
      this.logger.error(
        'Not-started cron aborted: config lookup failed',
        error,
      );
      return;
    }

    const now = moment();
    for (const trip of trips) {
      if (trip.tripActual) continue; // already started

      const driverAcceptanceValue = driverAcceptanceConfigMap.get(
        String(trip.orgID),
      );
      if (
        !driverAcceptanceValue ||
        driverAcceptanceValue.toLowerCase() !== 'on'
      )
        continue;

      const isPick = trip.pickDrop === PickDrop.Pick;
      const isDrop = trip.pickDrop === PickDrop.Drop;
      if (!isPick && !isDrop) continue;

      const configValue = isPick
        ? pickTimeoutConfigMap.get(String(trip.orgID))
        : dropTimeoutConfigMap.get(String(trip.orgID));
      const configMinutes = this.parseDurationToMinutes(configValue);
      if (configMinutes === null) continue;

      const anchor = this.getNotStartedAnchor(trip);
      if (!anchor) continue;

      // Pick: alert BEFORE shiftTime (Login Time) — unchanged.
      // Drop: alert AFTER shiftTime (Logout Time) — new.
      const alertTime = isPick
        ? anchor.clone().subtract(configMinutes, 'minutes')
        : anchor.clone().add(configMinutes, 'minutes');

      if (now.isSameOrAfter(alertTime)) {
        const existingAlert = await this.alertModel.findOne({
          where: {
            tripID: trip.id,
            orgID: trip.orgID,
            source: 'System Generated',
            remarks: NOT_STARTED_REMARK,
            status: { [Op.in]: [ReadStatus.Pending, ReadStatus.Closed] },
          },
        });
        if (!existingAlert) {
          await this.createCronAlert(trip, NOT_STARTED_REMARK);
        }
      }
    }
  }

  private async getConfigMapForOrgs(
    orgIDs: (string | bigint)[],
    configName: string,
  ): Promise<Map<string, string>> {
    if (!orgIDs?.length) return new Map();
    const config = await this.configModel.findOne({
      where: {
        [Op.and]: [
          sequelize.where(
            sequelize.fn(
              'REPLACE',
              sequelize.fn('LOWER', sequelize.col('configName')),
              '_',
              ' ',
            ),
            configName.toLowerCase().replace(/\_+/g, ' '),
          ),
        ],
      },
    });
    if (!config) {
      throw new BadRequestException(
        `Configuration for ${configName} not found.`,
      );
    }
    const uniqueOrgIDs = [...new Set(orgIDs)];
    const companyConfigs = await this.companyConfigModel.findAll({
      where: {
        configID: config.id,
        orgID: { [Op.in]: uniqueOrgIDs },
      },
      raw: true,
    });
    const configMap = new Map<string, string>();
    uniqueOrgIDs.forEach((orgID) => {
      configMap.set(String(orgID), config.defaultValue ?? null);
    });
    companyConfigs.forEach((companyConfig) => {
      configMap.set(String(companyConfig.orgID), companyConfig.configValue);
    });
    return configMap;
  }

  private async createCronAlert(trip: any, remarks: string): Promise<void> {
    try {
      const alertData = {
        location: trip?.org?.geoCode || null,
        remarks,
        tripID: trip?.id,
        orgID: trip?.orgID,
        source: 'System Generated',
        type: 'alert',
        status: ReadStatus.Pending,
        driverID: trip?.driverID,
        employeeID: null,
        vendorID: trip?.vendorID,
      };
      await this.alertModel.create(alertData);
    } catch (error) {
      this.logger.error('Error creating cron alert:', error);
    }
  }

  async handleVehicleDelayNotification() {
    this.logger.log('----- Running Vehicle Delay Cron ----');
    const currentTime = moment().format('HH:mm');
    const currentDate = moment().format('YYYY-MM-DD');
    const delayedTrips = await this.tripModel.findAll({
      where: {
        status: TripStatus.Ongoing,
        date: currentDate,
      },
      include: [
        {
          model: TripRequest,
          as: 'employeeTripRequest',
          where: {
            markCabReached: null,
            cabArrivedAt: null,
            pickUpTime: {
              [Op.lt]: currentTime,
            },
          },
        },
      ],
    });
    if (!delayedTrips.length) {
      this.logger.log('No delayed trips found.');
      return;
    }
    this.logger.log(`Found ${delayedTrips.length} delayed trip(s).`);
    return delayedTrips;
  }
}
