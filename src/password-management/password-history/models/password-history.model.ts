import sequelize from 'sequelize';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Authentication } from 'src/auth/models/authentication.model';
import { Employee } from 'src/employee/models/employee.model';
@Table({
  paranoid: true,
  timestamps: true,
})
export class PasswordHistory extends Model {
  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
  })
  id: bigint;

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  employeeID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    as: 'employee',
  })
  employee: Employee;

  @ForeignKey(() => Authentication)
  @Column(sequelize.BIGINT)
  authID: bigint; //  ADD THIS

  @BelongsTo(() => Authentication, {
    foreignKey: 'authID',
    as: 'authentication',
  })
  authentication: Authentication;

  @Column({ type: sequelize.DATE })
  createdDate: Date;

  @Column
  hashedPassword: string;
}
