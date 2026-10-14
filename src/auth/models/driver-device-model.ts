import {
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  Table,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Driver } from 'src/drivers/models/driver.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class DriverDeviceInfo extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @ForeignKey(() => Driver)
  @Column(sequelize.BIGINT)
  driverID: bigint;

  @BelongsTo(() => Driver, {
    foreignKey: 'driverID',
    as: 'driver',
  })
  driver: Driver;

  @Column({ type: DataType.STRING, allowNull: true })
  deviceNo: string;

  @Column({ type: DataType.STRING, allowNull: true })
  deviceToken: string;

  @Column({ type: DataType.STRING, allowNull: true })
  deviceType: string;

  @Column({ type: DataType.STRING, allowNull: true })
  appVersion: string;

  @Column({ type: DataType.STRING, allowNull: true })
  osVersion: string;

  @Column({ type: DataType.DATE, allowNull: true })
  lastLogin: Date;
}
