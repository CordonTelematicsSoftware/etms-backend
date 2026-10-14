import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
} from 'sequelize-typescript';
import sequelize from 'sequelize';

@Table({
  timestamps: true,
  paranoid: true,
})
export class GmsCategory extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column
  description: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  attachmentRequired: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  notificationOn: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  alertEmails: string[];

  @Column({
    type: DataType.ENUM,
    values: ['Low', 'Medium', 'High'],
  })
  priority: string;

  @Column
  orgId: number;
}
