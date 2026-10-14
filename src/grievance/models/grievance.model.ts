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
import { GmsCategory } from 'src/gms-category/models/gms-category.model';
import { Employee } from 'src/employee/models/employee.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Grievance extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  grievanceId: string;

  @ForeignKey(() => GmsCategory)
  @Column
  categoryId: number;

  @BelongsTo(() => GmsCategory, { foreignKey: 'categoryId', as: 'category' })
  category: GmsCategory;

  @Column
  description: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  attachments: string[];

  @ForeignKey(() => Employee)
  @Column
  createdById: number;

  @BelongsTo(() => Employee, { foreignKey: 'createdById', as: 'createdBy' })
  createdBy: Employee;

  @Column({ allowNull: true })
  transportTeamId: string;

  @Column({
    type: DataType.ENUM,
    values: ['Submitted', 'Inprogress', 'Resolved', 'Closed', 'Rejected'],
  })
  status: string;

  @Column({ allowNull: true })
  remarks: string;

  @Column({ allowNull: true })
  userType: string;

  @Column
  orgId: number;
}
