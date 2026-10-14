import { InternalServerErrorException, Logger } from '@nestjs/common';
import { DataTypes } from 'sequelize';
import { Authentication } from 'src/auth/models/authentication.model';
import { Log } from './models/log.model';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Employee } from 'src/employee/models/employee.model';
import { Organization } from 'src/organization/models/organization.model';
import * as dayjs from 'dayjs';
// import { CreateLogDto } from 'src/logger/dtos/create-log.dto';

export class DynamicEvenetLogModel {
  private logger = new Logger(DynamicEvenetLogModel.name);
  constructor(
    @InjectModel(Log) private logModel: typeof Log,
    private readonly sequelize: Sequelize,
  ) {}

  private getTableName(monthPayload: string, yearPayload?: string): string {
    const now = new Date();
    // Was `now.toLocaleString('default', { month: 'short' })` — Node's
    // Intl short-month format for September returns "Sept" (4 letters),
    // while every read path in eventlog.service.ts derives the month via
    // dayjs's 'MMM' token, which returns "Sep" (3 letters). Every other
    // month happens to agree between the two systems, which is exactly
    // why this only ever broke in September: writes went to
    // EventLogs_sept_<year>, reads looked for EventLogs_sep_<year>, and
    // found nothing. Using dayjs here too guarantees agreement by
    // construction, not by the coincidence of which month it is.
    const month = monthPayload
      ? monthPayload
      : dayjs(now).format('MMM').toLowerCase();
    const year = yearPayload ? yearPayload : now.getFullYear();
    return `EventLogs_${month}_${year}`;
  }

  public getLogModel(): typeof Log {
    const tableName = this.getTableName('');
    try {
      const DynamicLog = this.sequelize.define(
        tableName, // Dynamic table name
        {
          id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
          },
          objectType: {
            type: DataTypes.STRING,
            allowNull: true,
          },
          objectID: {
            type: DataTypes.BIGINT,
            allowNull: true,
          },
          changeType: {
            type: DataTypes.STRING,
            allowNull: true,
          },
          description: {
            type: DataTypes.STRING,
          },
          updatedBy: {
            type: DataTypes.STRING,
          },
          authID: {
            type: DataTypes.BIGINT,
            allowNull: true,
            references: {
              model: Authentication,
              key: 'id',
            },
          },
          employeeID: {
            type: DataTypes.BIGINT,
            allowNull: true,
            references: {
              model: Employee,
              key: 'id',
            },
          },
          orgID: {
            type: DataTypes.BIGINT,
            allowNull: true,
            references: {
              model: Organization,
              key: 'id',
            },
          },
          vendorID: {
            type: DataTypes.BIGINT,
            allowNull: true,
            // No sequelize `references` block here on purpose - the
            // dynamic-table analogue of an FK constraint against Vendor
            // isn't set up (mirrors how this file otherwise wires FKs).
            // Add one if/when a Vendor model import is wanted here.
          },
          changeJSON: {
            type: DataTypes.JSONB,
          },
          payloadJSON: {
            type: DataTypes.JSONB,
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

  public async getCurrentMonthLogModel(month: string, year?: string) {
    const tableName = this.getTableName(month, year);
    const LogModel = this.sequelize.define(
      tableName,
      {
        id: {
          type: DataTypes.BIGINT,
          primaryKey: true,
          autoIncrement: true,
        },
        objectType: DataTypes.STRING,
        objectID: DataTypes.BIGINT,
        changeType: DataTypes.STRING,
        description: DataTypes.STRING,
        updatedBy: DataTypes.STRING,
        changeJSON: DataTypes.JSONB,
        payloadJSON: DataTypes.JSONB,
        authID: DataTypes.BIGINT,
        employeeID: DataTypes.BIGINT,
        orgID: DataTypes.BIGINT,
        vendorID: DataTypes.BIGINT,
      },
      {
        tableName,
        timestamps: true,
        paranoid: true,
      },
    );

    return LogModel;
  }
}
