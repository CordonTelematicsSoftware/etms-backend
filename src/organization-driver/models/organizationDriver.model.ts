import sequelize from 'sequelize';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Driver } from 'src/drivers/models/driver.model';
import { Organization } from 'src/organization/models/organization.model';
import { Status } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class OrganizationDriver extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @ForeignKey(() => Driver)
  @Column(sequelize.BIGINT)
  driverID: string;
  @BelongsTo(() => Driver, {
    foreignKey: 'driverID',
    as: 'driver',
  })
  driver: Driver;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: string;
  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'org',
  })
  organization: Organization;

  // @BelongsTo(() => Trip, {
  //   foreignKey: 'tripID',
  //   as: 'trip',
  // })
  // trip: Trip;

  //  @Column({ defaultValue: PickDrop.Pick, allowNull: true })
  //   pickDrop: PickDrop;

  //   @Column({ allowNull: true })
  //   shiftTime: string;

  //   @Column({ allowNull: true })
  //   date: string;
  @ForeignKey(() => Vendor)
  @Column(sequelize.BIGINT)
  vendorID: string;
  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;
}
