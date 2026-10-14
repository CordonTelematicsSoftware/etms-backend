import sequelize from 'sequelize';
import {
  AutoIncrement,
  Column,
  Model,
  PrimaryKey,
  Table,
  DataType,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import { Trip } from 'src/trip-management/trip/models/trip.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class DriverOverspeed extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column({ allowNull: false })
  date: string;

  @Column({ allowNull: false })
  time: string;

  @ForeignKey(() => Trip)
  @Column(sequelize.BIGINT)
  tripID: bigint;

  @BelongsTo(() => Trip, {
    foreignKey: 'tripID',
    as: 'trip',
  })
  trip: Trip;

  @Column({ allowNull: true })
  orgID: bigint;

  @Column({ allowNull: true })
  driverID: bigint;

  @Column({ allowNull: true })
  driverCode: string;

  @Column({ allowNull: true })
  routeNumber: string;

  @Column({ allowNull: true })
  vendorCode: string;

  @Column({ allowNull: true })
  cabRegNo: string;

  @Column({ allowNull: true })
  pickDrop: string;

  @Column({ allowNull: true })
  lockStatus: string;

  @Column({ allowNull: true })
  estimatedDistance: string;

  @Column({ allowNull: true })
  estimatedOccupancy: string;

  @Column({ allowNull: true })
  employeeBoardedCount: number;

  @Column({ allowNull: true })
  location: string;

  @Column({ type: DataType.FLOAT, allowNull: false })
  currentSpeed: number;

  @Column({ type: DataType.FLOAT, allowNull: true })
  speedLimit: number;

  @Column({ allowNull: true })
  shiftTime: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  empCodes: string[];

  @Column({ allowNull: true })
  driverName: string;
}
