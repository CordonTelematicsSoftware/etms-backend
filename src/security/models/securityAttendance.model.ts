import {
  Column,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  BelongsTo,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { Security } from './security.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class SecurityAttendance extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  spockID: string;

  @Column
  tripID: string;

  @Column
  otp: string;

  @Column
  generatedTime: string;

  @Column
  expiryTime: string;

  @Column
  attendanceMarkedTime: string;

  @BelongsTo(() => Trip, {
    foreignKey: 'tripID',
    as: 'trip',
  })
  trip: Trip;

  @BelongsTo(() => Security, {
    foreignKey: 'spockID',
    as: 'security',
  })
  security: Security;

  @Column
  status: string;
}
