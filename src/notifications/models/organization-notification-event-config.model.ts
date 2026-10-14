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

import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationProvider } from '../enums/notification-provider.enum';
import { NotificationTemplate } from './notification-template.model';
import { Organization } from 'src/organization/models/organization.model';

@Table({
  tableName: 'OrganizationNotificationEventConfigs',
  timestamps: true,
})
export class OrganizationNotificationEventConfig extends Model {
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
  provider: NotificationProvider;

  @ForeignKey(() => NotificationTemplate)
  @Index
  @Column(DataType.BIGINT)
  templateId: number;

  @BelongsTo(() => NotificationTemplate, {
    foreignKey: 'templateId',
    as: 'template',
  })
  template: NotificationTemplate;

  @BelongsTo(() => Organization, {
    foreignKey: 'organizationId',
    as: 'organization',
  })
  organization: Organization;

  @Default(100)
  @Column(DataType.INTEGER)
  priority: number;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

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
