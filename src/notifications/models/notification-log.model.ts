import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import sequelize from 'sequelize';

import { NotificationTemplate } from './notification-template.model';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';
import { NotificationStatus } from '../enums/notification-status.enum';
import { Employee } from 'src/employee/models/employee.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';

@Table({
  tableName: 'NotificationLogs',
  timestamps: true,
})
export class NotificationLog extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Index
  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  organizationId: string;

  @Index
  @Column({
    type: DataType.STRING(150),
    allowNull: false,
  })
  event: string;

  @Column({
    type: DataType.ENUM(...Object.values(NotificationChannel)),
    allowNull: false,
  })
  channel: NotificationChannel;

  @Column({
    type: DataType.ENUM(...Object.values(NotificationProvider)),
    allowNull: false,
  })
  provider: NotificationProvider;

  @Default(NotificationStatus.QUEUED)
  @Index
  @Column({
    type: DataType.ENUM(...Object.values(NotificationStatus)),
  })
  status: NotificationStatus;

  @Column({ allowNull: true })
  recipientUserId: string;

  @Column({
    type: DataType.STRING(320),
    allowNull: true,
  })
  recipientEmail: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  recipientPhone: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  recipientDeviceToken: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  recipientSnsEndpointArn: string;

  @ForeignKey(() => NotificationTemplate)
  @Index
  @Column(DataType.UUID)
  templateId: string;

  @BelongsTo(() => NotificationTemplate, {
    foreignKey: 'templateId',
    as: 'template',
  })
  template: NotificationTemplate;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  subject: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  renderedBody: string;

  @Default({})
  @Column(DataType.JSONB)
  payload: Record<string, unknown>;

  @Default({})
  @Column(DataType.JSONB)
  providerResponse: Record<string, unknown>;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  providerMessageId: string;

  @Column({
    type: DataType.STRING(150),
    allowNull: true,
  })
  errorCode: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  errorMessage: string;

  @Index
  @Column({
    type: DataType.STRING(150),
    allowNull: true,
  })
  eventLogId: string;

  @Default(0)
  @Column(DataType.INTEGER)
  retryCount: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  sentAt: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  failedAt: Date;

  @ForeignKey(() => Employee)
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  empID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'empID',
    as: 'employee',
  })
  employee: Employee;

  @ForeignKey(() => Trip)
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  tripID: bigint;

  @BelongsTo(() => Trip, {
    foreignKey: 'tripID',
    as: 'trip',
  })
  trip: Trip;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  smsCount: number;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
  })
  smsCost: number;
}
