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
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class VendorRole extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column({ type: DataType.ARRAY(DataType.STRING(100)) })
  permissions: string[];

  @ForeignKey(() => Vendor)
  @Column(sequelize.BIGINT)
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  @Column({ defaultValue: true, allowNull: false })
  enabled: boolean;

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  createdBy: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'createdBy',
    as: 'createdByUser',
  })
  createdByUser: Employee;
}
