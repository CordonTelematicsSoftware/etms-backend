import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  //   InternalServerErrorException,
} from 'node_modules/@nestjs/common';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { Trip } from '../models/trip.model';
import { InjectModel } from 'node_modules/@nestjs/sequelize';
import { PickDrop, TripStatus } from 'src/shared/enums';
import { Driver } from 'src/drivers/models/driver.model';
import { Cab } from 'src/cabs/models/cab.model';
import { Security } from 'src/security/models/security.model';
import { Op } from 'sequelize';
import { Organization } from 'src/organization/models/organization.model';
import { EventLogService } from 'src/eventlog/eventlog.service';

@Injectable()
export class SpocTripService {
  private logger = new Logger(SpocTripService.name);
  constructor(
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    @InjectModel(Security)
    private securityModel: typeof Security,
    private eventlogService: EventLogService,
  ) {}

  async findAllTripsByDate(
    shiftTime: string,
    date: string,
    user: any,
    pickDrop: boolean,
  ): Promise<PaginatedList<Trip>> {
    try {
      const trip = await this.tripModel.findAndCountAll({
        where: {
          shiftTime: shiftTime,
          date: date,
          orgID: user.orgID,
          pickDrop: pickDrop ? PickDrop?.Pick : PickDrop?.Drop,
          status: { [Op.ne]: TripStatus.Cancelled },
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
          //   {
          //     model: Vendor,
          //     as: 'vendor',
          //     attributes: ['id', 'name'], // Include only the vendor's name
          //   },
          {
            model: Security,
            as: 'security',
            attributes: ['id', 'name'], // Include only the security's name
          },
        ],
      });
      // const trips = trip.map(trip => trip.dataValues);
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

  async updateSpocToTrip(updateTripInput: any, user: any): Promise<any> {
    try {
      const { updatedTrips } = updateTripInput || {};
      const { id, spockID, spockCode, spock } = updatedTrips || {};

      // Fetched before the update, with the current Spoc's name attached,
      // so the log can show a real "previous Spoc" instead of a bare ID
      // that's already gone by the time anyone reads the log.
      const existingTrip = await this.tripModel.findOne({
        where: { id },
        include: [
          {
            model: Security,
            as: 'security',
            attributes: ['id', 'name'],
          },
        ],
      });

      if (!existingTrip) {
        throw new NotFoundException('Trip not found');
      }

      const previousSpockID = existingTrip.spockID;
      const previousSpockName = existingTrip.security?.name ?? null;

      const updatedTrip = await this.tripModel.update(
        {
          spockID: spockID,
          spockCode: spockCode,
          spock: spock,
        },
        { where: { id: id }, returning: true },
      );

      // Resolve the newly-assigned Spoc's name too - null (renders as
      // N/A downstream) when this call is an unassignment rather than
      // an assignment.
      let newSpockName: string | null = null;
      if (spockID) {
        const newSecurity = await this.securityModel.findOne({
          where: { id: spockID },
          attributes: ['name'],
        });
        newSpockName = newSecurity?.name ?? null;
      }

      const isAssigning = !!spockID;
      const wasAssigned = !!previousSpockID;
      const actionLabel = isAssigning
        ? wasAssigned
          ? 'reassigned'
          : 'assigned'
        : 'removed';

      const formatDateOnly = (value: any): string => {
        if (!value) return String(value ?? '');
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      };

      const routeLabel = `Trip ${id} (${formatDateOnly(existingTrip.date)} - ${
        existingTrip.shiftTime
      })`;

      const eventLog = {
        objectType: 'Trip',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: {
          tripID: id,
          routeNumber: existingTrip.routeNumber,
          date: existingTrip.date,
          shiftTime: existingTrip.shiftTime,
          previousSpoc: previousSpockName,
          currentSpoc: newSpockName,
        },
        requestPayload: JSON.parse(JSON.stringify(updateTripInput)),
        changeJSON: {
          Spoc: {
            OldValue: previousSpockName,
            newValue: newSpockName,
          },
        },
        customDescription: `${actionLabel} Spoc${
          newSpockName ? ` "${newSpockName}"` : ''
        } ${isAssigning ? 'to' : 'from'} ${routeLabel}`,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Trips updated successfully',
        data: updatedTrip,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
