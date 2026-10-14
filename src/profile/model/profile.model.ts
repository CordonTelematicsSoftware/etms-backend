import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  BelongsTo,
  ForeignKey,
  AutoIncrement,
} from 'sequelize-typescript';
import sequelize from 'sequelize';

import { Employee } from 'src/employee/models/employee.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Profile extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  dob: Date;

  @Column
  bloodGroup: string;

  @Column
  address: string;

  @Column({ allowNull: true })
  image: string;

  @Column
  emergencyContactNo: string;

  @Column
  emergencyContactName: string;

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  employeeID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    as: 'employee',
  })
  employee: Employee;
  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  securityPin: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  pinResetHashedOtp: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  pinResetOtpCreatedAt: Date;
}
