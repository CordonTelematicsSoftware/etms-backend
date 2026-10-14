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
import { Employee } from 'src/employee/models/employee.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class EmployeeDeviceInfo extends Model {
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
