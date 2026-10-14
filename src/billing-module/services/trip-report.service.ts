import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SortOrder, UserType } from 'src/shared/enums';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { Op } from 'sequelize';
import { TripReportInput } from '../dtos/trip-report-input.dto';
import { Driver } from 'src/drivers/models/driver.model';
import { Cab } from 'src/cabs/models/cab.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { TripActual } from 'src/trip-management/trip/models/trip-actual.model';
import { Organization } from 'src/organization/models/organization.model';
import * as moment from 'moment';

@Injectable()
export class TripBillingReportService {
  private logger = new Logger(TripBillingReportService.name);

  constructor(
    @InjectModel(Trip)
    private tripModel: typeof Trip,
  ) {}

  async findAll(
    tripReportInput: TripReportInput,
    user: any,
  ): Promise<PaginatedList<Trip>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        startDate,
        endDate,
        vendorID,
      } = tripReportInput;

      const whereCondition: any = {};

      if (user.userType === UserType.Employee) {
        whereCondition.orgID = user.orgID;
      }
      if (user.userType === UserType.Vendor) {
        whereCondition.vendorID = user.vendorID;
      }
      if (vendorID) {
        whereCondition.vendorID = vendorID;
      }
      whereCondition.orgID = user.orgID;

      // const parsedStartDate = startDate ? new Date(startDate) : null;
      // const parsedEndDate = endDate ? new Date(endDate) : null;

      // if (parsedStartDate && parsedEndDate) {
      //   whereCondition.date = {
      //     [Op.between]: [parsedStartDate, parsedEndDate],
      //   };
      // } else if (parsedStartDate) {
      //   whereCondition.date = {
      //     [Op.gte]: parsedStartDate,
      //   };
      // } else if (parsedEndDate) {
      //   whereCondition.date = {
      //     [Op.lte]: parsedEndDate,
      //   };
      // }
      const parsedStartDate = startDate
        ? moment(startDate).startOf('day').toDate()
        : null;
      const parsedEndDate = endDate
        ? moment(endDate).endOf('day').toDate()
        : null;

      if (parsedStartDate && parsedEndDate) {
        whereCondition.date = {
          [Op.between]: [parsedStartDate, parsedEndDate],
        };
      } else if (parsedStartDate) {
        whereCondition.date = {
          [Op.gte]: parsedStartDate,
        };
      } else if (parsedEndDate) {
        whereCondition.date = {
          [Op.lte]: parsedEndDate,
        };
      }

      const trips = await this.tripModel.findAndCountAll({
        where: whereCondition,
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        attributes: [
          'id',
          'vendorCode',
          'vendorID',
          'seats',
          'employees',
          'pickDrop',
          'tripLocation',
          'status',
          'date',
          'shiftTime',
        ],
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name'],
          },
          {
            model: TripActual,
            as: 'tripActual',
          },
          {
            model: Cab,
            as: 'cab',
          },
          {
            model: Driver,
            as: 'driver',
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

  async findOne(id: number): Promise<any> {
    const trip = await this.tripModel.findOne({
      where: { id },
      include: [
        {
          model: Vendor,
          as: 'vendor',
        },
        {
          model: TripActual,
          as: 'tripActual',
        },
        {
          model: Cab,
          as: 'cab',
        },
        {
          model: Driver,
          as: 'driver',
        },
        {
          model: Organization,
          as: 'org',
        },
      ],
    });

    if (!trip) {
      throw new NotFoundException(`Trip  not found`);
    }
    return trip;
  }

  async listAll(
    user?: any,
    startDate?: string,
    endDate?: string,
    vendorID?: string,
  ): Promise<PaginatedList<Trip>> {
    try {
      const whereCondition: any = {};

      if (user.userType === UserType.Employee) {
        whereCondition.orgID = user.orgID;
      }
      if (user.userType === UserType.Vendor) {
        whereCondition.vendorID = user.vendorID;
      }
      if (vendorID) {
        whereCondition.vendorID = vendorID;
      }
      whereCondition.orgID = user.orgID;

      const parsedStartDate = startDate
        ? moment(startDate).startOf('day').toDate()
        : null;
      const parsedEndDate = endDate
        ? moment(endDate).endOf('day').toDate()
        : null;

      if (parsedStartDate && parsedEndDate) {
        whereCondition.date = {
          [Op.between]: [parsedStartDate, parsedEndDate],
        };
      } else if (parsedStartDate) {
        whereCondition.date = {
          [Op.gte]: parsedStartDate,
        };
      } else if (parsedEndDate) {
        whereCondition.date = {
          [Op.lte]: parsedEndDate,
        };
      }

      const trips = await this.tripModel.findAndCountAll({
        where: whereCondition,
        attributes: [
          'id',
          'vendorCode',
          'vendorID',
          'seats',
          'employees',
          'pickDrop',
          'tripLocation',
          'status',
          'date',
          'shiftTime',
        ],
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name'],
          },
          {
            model: TripActual,
            as: 'tripActual',
          },
          {
            model: Cab,
            as: 'cab',
          },
          {
            model: Driver,
            as: 'driver',
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
}
