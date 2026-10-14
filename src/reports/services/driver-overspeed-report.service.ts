import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { DriverOverspeed } from 'src/trip-management/trip/models/driver-overspeed.model';
import { DriverOverspeedReportFilterDto } from '../dto/driver-overspeed-report-filter.dto';
import { SortOrder } from 'src/shared/enums';

@Injectable()
export class DriverOverspeedReportService {
  private logger = new Logger(DriverOverspeedReportService.name);

  constructor(
    @InjectModel(DriverOverspeed)
    private driverOverspeedModel: typeof DriverOverspeed,
  ) {}

  async findAllReports(
    filterDto: DriverOverspeedReportFilterDto,
    user: any,
  ): Promise<PaginatedList<DriverOverspeed>> {
    try {
      const {
        startDate,
        endDate,
        driverCode,
        tripId,
        take = 25,
        skip = 0,
        search,
        sortBy = 'date',
        sortOrder = SortOrder.DESC,
      } = filterDto;

      this.logger.log(
        `Finding overspeed events between ${startDate} and ${endDate}`,
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

      if (user?.orgID) {
        whereClause.orgID = user.orgID;
      }

      if (driverCode) {
        whereClause.driverCode = driverCode;
      }

      if (tripId) {
        whereClause.tripID = tripId;
      }

      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            { driverCode: { [Op.iLike]: `%${search}%` } },
            { location: { [Op.iLike]: `%${search}%` } },
          ],
        };
      }

      const offset = skip * take;
      // Secondary sort by time keeps same-day rows ordered when sorting by date
      const order: any[] = [[sortBy, sortOrder]];
      if (sortBy !== 'time') {
        order.push(['time', sortOrder]);
      }

      const overspeedEvents = await this.driverOverspeedModel.findAndCountAll({
        where: whereClause,
        limit: take,
        offset,
        order,
      });

      this.logger.log(`Found ${overspeedEvents.count} overspeed events`);

      return {
        totalItems: overspeedEvents.count,
        items: overspeedEvents.rows,
        entityPermissions: user?.permissions?.filter(
          (permission) => permission?.split('-')?.[0] === 'Report',
        ),
      };
    } catch (error: any) {
      this.logger.error(
        `Error fetching driver overspeed reports: ${error.message}`,
        error.stack,
      );
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error fetching driver overspeed reports',
      );
    }
  }
}
