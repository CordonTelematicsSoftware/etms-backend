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
import { Employee } from './employee.model';
import { Organization } from 'src/organization/models/organization.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class EmployeeTripOtp extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  employeeID: string;

  @Column
  employeeCode: string;

  @Column
  tripID: string;

  @Column
  orgID: string;

  @Column
  otp: string;

  @Column
  generatedTime: string;

  @Column
  expiryTime: string;

  @BelongsTo(() => Trip, {
    foreignKey: 'tripID',
    as: 'trip',
  })
  trip: Trip;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    as: 'employee',
  })
  employee: Employee;

  @Column
  status: string;
}
