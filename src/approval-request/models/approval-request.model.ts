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
import { Cab } from 'src/cabs/models/cab.model';
import { Driver } from 'src/drivers/models/driver.model';
import { Employee } from 'src/employee/models/employee.model';
import { Organization } from 'src/organization/models/organization.model';
import { Status } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class ApprovalRequest extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  requestedBy: string;

  @ForeignKey(() => Cab)
  @Column(sequelize.BIGINT)
  cabID: bigint;

  @BelongsTo(() => Cab, {
    foreignKey: 'cabID',
    as: 'cab',
  })
  cab: Cab;

  @ForeignKey(() => Driver)
  @Column(sequelize.BIGINT)
  driverID: bigint;

  @BelongsTo(() => Driver, {
    foreignKey: 'driverID',
    as: 'driver',
  })
  driver: Driver;

  @ForeignKey(() => Vendor)
  @Column(sequelize.BIGINT)
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  employeeID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    as: 'employee',
  })
  employee: Employee;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  oldRecord: object;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  newRecord: object;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  approvedOn: Date;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  rejectedOn: Date;
}
