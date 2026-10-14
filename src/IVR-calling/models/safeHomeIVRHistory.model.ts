import sequelize from 'sequelize';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Employee } from 'src/employee/models/employee.model';
import { Organization } from 'src/organization/models/organization.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class SafeHomeIVRHistory extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  employeeID: bigint;
  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    as: 'employee',
  })
  employee: Employee;

  @Column
  employeePhone: string;

  @Column({ allowNull: true })
  driverPhone: string;

  @Column({ allowNull: true })
  helpdeskPhone: string;

  @Column({ allowNull: true })
  coPassengerPhone: string;

  @ForeignKey(() => TripRequest)
  @Column({ allowNull: true })
  tripRequestID: bigint;

  @BelongsTo(() => TripRequest, {
    foreignKey: 'tripRequestID',
    as: 'tripRequest',
  })
  tripRequest: TripRequest;

  @Column
  callUUID: string;

  @Column
  callID: string;

  @Column
  callStatus: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  date: Date;

  @Column({
    type: DataType.ENUM(
      'SAFE_HOME',
      'EMPLOYEE_TO_DRIVER',
      'DRIVER_TO_EMPLOYEE',
      'EMPLOYEE_TO_HELPDESK',
      'DRIVER_TO_HELPDESK',
      'EMPLOYEE_TO_COPASSENGER',
    ),
  })
  callType: string;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @ForeignKey(() => Trip)
  @Column({ allowNull: true })
  tripID: bigint;

  @BelongsTo(() => Trip, {
    foreignKey: 'tripID',
    as: 'trip',
  })
  trip: Trip;

  @Column({ allowNull: true })
  refID: string;

  @Column({ allowNull: true })
  callDuration: number;

  @Column({ allowNull: true })
  recordingUrl: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  callCount: number;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
  })
  callCost: number;

  @Column({ type: DataType.STRING, allowNull: true })
  // The DTMF key the employee pressed on the safe-home call: '1' = safe,
  // '2' = not safe. Null means she never answered, or confirmed by PIN instead.
  // Stored so the report can distinguish "said not safe" from "never answered".
  digitPressed: string;
}
