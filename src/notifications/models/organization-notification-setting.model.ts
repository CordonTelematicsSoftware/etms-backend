import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  Index,
} from 'sequelize-typescript';
import sequelize from 'sequelize';

import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';

@Table({
  tableName: 'OrganizationNotificationSettings',
  timestamps: true,
})
export class OrganizationNotificationSetting extends Model {
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
    type: DataType.ENUM(...Object.values(NotificationChannel)),
    allowNull: false,
  })
  channel: NotificationChannel;

  @Default(true)
  @Column(DataType.BOOLEAN)
  enabled: boolean;

  @Column({
    type: DataType.ENUM(...Object.values(NotificationProvider)),
    allowNull: false,
  })
  defaultProvider: NotificationProvider;

  @Default({})
  @Column(DataType.JSONB)
  providerConfig: Record<string, unknown>;

  @Column({
    type: DataType.STRING(150),
    allowNull: true,
  })
  createdBy: string;

  @Column({
    type: DataType.STRING(150),
    allowNull: true,
  })
  updatedBy: string;
}
