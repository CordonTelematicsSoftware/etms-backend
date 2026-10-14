import sequelize from 'sequelize';
import {
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Status } from 'src/shared/enums';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Vendor extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column
  code: string;

  @Column({ type: DataType.STRING(100) })
  email: string;

  @Column
  phone: string;

  @Column({ allowNull: true })
  logo: string;

  @Column({ allowNull: true })
  address: string;

  @Column({ allowNull: true })
  gstNo: string;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  //   @ForeignKey(() => Employee)
  //   @Column(sequelize.BIGINT)
  //   createdBy: bigint;

  //   @BelongsTo(() => Employee, {
  //     foreignKey: 'createdBy',
  //     as: 'createdByUser',
  //   })
  //   createdByUser: Employee;
}
