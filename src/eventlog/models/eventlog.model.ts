import {
  Column,
  Model,
  Table,
  AutoIncrement,
  PrimaryKey,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Authentication } from 'src/auth/models/authentication.model';
import { Employee } from 'src/employee/models/employee.model';

@Table({
  timestamps: true,
  paranoid: true,
  // kk
})
export class EventLog extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column
  id: number;

  @Column
  objectType: string;

  @Column
  objectID: string;

  @Column
  changeType: ChangeType;

  @Column
  description: string;

  @Column
  updatedBy: string;

  @ForeignKey(() => Authentication)
  @Column
  authID: number;

  @BelongsTo(() => Authentication, { foreignKey: 'authID', as: 'authUser' })
  authUser: Authentication;

  @ForeignKey(() => Employee)
  @Column
  employeeID: number;

  @BelongsTo(() => Employee, { foreignKey: 'employeeID', as: 'employee' })
  employee: Employee;

  @Column(sequelize.JSON)
  changeJSON: JSON;

  @Column(sequelize.JSON)
  payloadJSON: JSON;
}

export enum ChangeType {
  add = 'add',
  edit = 'edit',
  delete = 'delete',
  list = 'list',
  view = 'view',
  export = 'export',
  import = 'import',
  mail = 'mail',
}
