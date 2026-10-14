import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Log } from 'src/logger/models/log.model';
import { InjectModel } from '@nestjs/sequelize';
import { DataTypes, Op, literal } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

// import { generateSearchText } from 'src/shared/utils/search-utils';
import { CreateLogDto } from './dtos/create-log.dto';
import * as moment from 'moment';
import { LogFilterDto } from './dtos/log-filter';
import { PaginatedList } from 'src/shared/interfaces/generic-response';
import { SortOrder } from 'src/shared/enums';
import { Authentication } from 'src/auth/models/authentication.model';

@Injectable()
export class LoggerService {
  private logger = new Logger(LoggerService.name);
  constructor(
    @InjectModel(Log) private logModel: typeof Log,
    private readonly sequelize: Sequelize,
  ) {}

  async create(createLogDto: CreateLogDto): Promise<boolean> {
    return true;

    try {
      const { request, connection, response, user } = createLogDto;

      await this.ensureTableExists();
      const LogModel = this.getLogModel();

      await LogModel.create({
        method: request.method,
        ipddress: connection.remoteAddress,
        request: request,
        response: response,
        employeeId: user?.employeeID ?? null,
        userID: user?.id,
        description: response?.message,
      });

      return true;
    } catch (error) {
      this.logger.log(error);

      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(logFilterDto: LogFilterDto): Promise<PaginatedList<Log>> {
    const {
      search = '',
      skip = 25,
      take = 0,
      sortBy = 'createdAt',
      sortOrder = SortOrder.DESC,
      fromDate,
      toDate,
    } = logFilterDto;

    let whereClause = {};

    if (search) {
      whereClause = {
        // searchText: {
        //   [Op.match]: Sequelize.fn('to_tsquery', searchVector),
        // },
      };
    }

    if (fromDate && toDate) {
      whereClause = {
        ...whereClause,
        [Op.and]: [
          {
            createdAt: {
              [Op.gte]: moment(new Date(fromDate)).format('YYYY-MM-DD'),
            },
          },
          {
            createdAt: {
              [Op.lt]: moment(new Date(toDate))
                .add(1, 'days')
                .format('YYYY-MM-DD'),
            },
          },
        ],
      };
    }

    const log = await this.logModel.findAndCountAll({
      where: whereClause,
      attributes: [
        'id',
        'method',
        [literal("request -> 'url'"), 'url'],
        [literal("request -> 'user'"), 'user'],
        [literal("request -> 'body'"), 'body'],
        'description',
        'createdAt',
      ],
      limit: take,
      offset: skip * take,
      order: search
        ? [[literal(`"score"`), 'desc']]
        : [[`${sortBy}`, `${sortOrder}`]],
    });

    return {
      totalItems: log.count,
      items: log.rows,
    };
  }

  private getTableName(): string {
    const now = new Date();
    const month = now
      .toLocaleString('default', { month: 'short' })
      .toLowerCase(); // e.g., 'nov'
    const year = now.getFullYear(); // e.g., '2024'
    return `Logs_${month}_${year}`;
  }

  // Function to initialize the dynamic log model
  public getLogModel(): typeof Log {
    const tableName = this.getTableName();
    try {
      const DynamicLog = this.sequelize.define(
        tableName, // Dynamic table name
        {
          id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
          },
          method: {
            type: DataTypes.STRING,
            allowNull: false,
          },
          request: {
            type: DataTypes.JSONB,
            allowNull: false,
          },
          response: {
            type: DataTypes.JSONB,
            allowNull: false,
          },
          ipaddress: {
            type: DataTypes.STRING,
            allowNull: true,
          },
          description: {
            type: DataTypes.STRING,
          },
          authID: {
            type: DataTypes.BIGINT,
            allowNull: true,
            references: {
              model: Authentication, // Reference to your Authentication table
              key: 'id',
            },
          },
        },
        {
          tableName, // Dynamic table name
          timestamps: true,
          paranoid: true,
        },
      );

      return DynamicLog as typeof Log;
    } catch (error) {
      this.logger.log(error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  public async ensureTableExists(): Promise<void> {
    const logModel = this.getLogModel();
    await logModel.sync({ force: false }); // Ensures the table exists but does not recreate it
  }

  public async getCurrentMonthLogModel() {
    const tableName = this.getTableName();

    const LogModel = this.sequelize.define(
      tableName,
      {
        id: {
          type: DataTypes.BIGINT,
          primaryKey: true,
          autoIncrement: true,
        },
        method: DataTypes.STRING,
        request: DataTypes.JSONB,
        response: DataTypes.JSONB,
        ipaddress: DataTypes.STRING,
        description: DataTypes.STRING,
        authID: DataTypes.BIGINT,
      },
      {
        tableName,
        timestamps: true,
        paranoid: true,
      },
    );

    return LogModel;
  }

  public async getCurrentMonthLogs() {
    const LogModel = await this.getCurrentMonthLogModel();

    // Fetch logs
    const logs = await LogModel.findAll({
      order: [['createdAt', 'DESC']], // Optional: Sort logs
    });

    return logs;
  }
}
