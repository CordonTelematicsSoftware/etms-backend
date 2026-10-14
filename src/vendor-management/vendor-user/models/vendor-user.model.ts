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
import { VendorRole } from 'src/vendor-management/vendor-role/models/vendor-role.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class VendorUser extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column({ type: DataType.STRING(100), validate: { isEmail: true } })
  email: string;

  @Column
  phone: string;

  @Column({ allowNull: true })
  image: string;

  @ForeignKey(() => Vendor)
  @Column(sequelize.BIGINT)
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID', // This links to the vendorID column
    as: 'vendor', // This provides an alias for the association
  })
  vendor: Vendor;

  @ForeignKey(() => VendorRole)
  @Column(sequelize.BIGINT)
  vendorRoleID: bigint;

  @BelongsTo(() => VendorRole, {
    foreignKey: 'vendorRoleID',
    as: 'vendorRole',
  })
  vendorRole: VendorRole;

  // @Column
  // hashedPassword: string;

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  createdBy: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'createdBy',
    as: 'createdByUser',
  })
  createdByUser: Employee;
}
