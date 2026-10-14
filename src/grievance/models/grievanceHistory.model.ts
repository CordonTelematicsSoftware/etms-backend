import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Grievance } from './grievance.model';
import { Employee } from 'src/employee/models/employee.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class GrievanceHistory extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @ForeignKey(() => Grievance)
  @Column
  grievanceId: string;

  @BelongsTo(() => Grievance, { foreignKey: 'grievanceId', as: 'grievance' })
  grievance: Grievance;

  @Column({
    type: DataType.ENUM,
    values: ['Submitted', 'Inprogress', 'Resolved', 'Closed', 'Rejected'],
  })
  status: string;

  @Column({ allowNull: true })
  remarks: string;

  @ForeignKey(() => Employee)
  @Column
  createdById: number;

  @BelongsTo(() => Employee, { foreignKey: 'createdById', as: 'createdBy' })
  createdBy: Employee;

  @ForeignKey(() => Employee)
  @Column
  updatedById: number;

  @BelongsTo(() => Employee, { foreignKey: 'updatedById', as: 'updatedBy' })
  updatedBy: Employee;

  @Column
  userType: string;
}
