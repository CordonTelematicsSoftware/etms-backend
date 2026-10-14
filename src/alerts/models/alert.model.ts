import {
  Column,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  Default,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Employee } from '../../employee/models/employee.model';
import { Driver } from 'src/drivers/models/driver.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { Organization } from 'src/organization/models/organization.model';
import { ReadStatus } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Alert extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column({
    allowNull: false,
    comment: 'Source of the alert - Employee or Driver',
  })
  source: string;

  @Column({
    allowNull: false,
    comment: 'Location coordinates or description where alert was raised',
  })
  location: string;

  @Column({
    allowNull: false,
    comment: 'Alert description or remarks',
  })
  remarks: string;

  @Default('alert')
  @Column({
    comment: 'Type of alert - alert, emergency, breakdown, etc.',
  })
  type: string;

  // Trip relationship - Required for trip-based alerts
  @ForeignKey(() => Trip)
  @Column({
    type: sequelize.BIGINT,
    allowNull: false,
    comment: 'Trip ID associated with this alert',
  })
  tripID: bigint;

  @BelongsTo(() => Trip, {
    foreignKey: 'tripID',
    as: 'trip',
  })
  trip: Trip;

  // Organization relationship - for filtering and management
  @ForeignKey(() => Organization)
  @Column({
    type: sequelize.BIGINT,
    allowNull: false,
    comment: 'Organization ID for alert management',
  })
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  // Employee relationship - for employee-raised alerts
  @ForeignKey(() => Employee)
  @Column({
    type: sequelize.BIGINT,
    allowNull: true,
    comment: 'Employee ID if alert raised by employee',
  })
  employeeID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    as: 'employee',
  })
  employee: Employee;

  // Driver relationship - for driver-raised alerts
  @ForeignKey(() => Driver)
  @Column({
    type: sequelize.BIGINT,
    allowNull: true,
    comment: 'Driver ID if alert raised by driver',
  })
  driverID: bigint;

  @BelongsTo(() => Driver, {
    foreignKey: 'driverID',
    as: 'driver',
  })
  driver: Driver;

  @ForeignKey(() => Vendor)
  @Column({
    type: sequelize.BIGINT,
    allowNull: true,
    comment: 'Vendor ID for alert management',
  })
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  @Column({ defaultValue: ReadStatus.Pending, allowNull: true })
  status: ReadStatus;

  @Column({
    allowNull: true,
  })
  acknowledgedDate: Date;

  @Column({
    allowNull: true,
  })
  acknowledgedTime: string;

  @Column({
    allowNull: true,
  })
  comments: string;

  @ForeignKey(() => TripRequest)
  @Column({ allowNull: true })
  tripRequestID: bigint;

  @BelongsTo(() => TripRequest, {
    foreignKey: 'tripRequestID',
    as: 'tripRequest',
  })
  tripRequest: TripRequest;
}
