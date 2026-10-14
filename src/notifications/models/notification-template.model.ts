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

@Table({
  tableName: 'NotificationTemplates',
  timestamps: true,
})
export class NotificationTemplate extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column({
    type: DataType.STRING(150),
    allowNull: true, // ← was false
  })
  providerTemplateId: string | null;

  @Index
  @Column({
    type: DataType.STRING(150),
    allowNull: false,
  })
  code: string;

  @Column({
    type: DataType.STRING(150),
    allowNull: false,
  })
  name: string;

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

  @Default('en')
  @Index
  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  locale: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  subject: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  body: string;

  @Default({})
  @Column(DataType.JSONB)
  variables: Record<string, unknown>;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @Default(true)
  @Index
  @Column(DataType.BOOLEAN)
  isActive: boolean;

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
