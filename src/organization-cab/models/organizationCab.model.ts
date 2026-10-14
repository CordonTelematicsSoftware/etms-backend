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
import { Cab } from 'src/cabs/models/cab.model';
import { Organization } from 'src/organization/models/organization.model';
import { Status } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class OrganizationCab extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @ForeignKey(() => Cab)
  @Column(sequelize.BIGINT)
  cabID: string;
  @BelongsTo(() => Cab, {
    foreignKey: 'cabID',
    as: 'cab',
  })
  cab: Cab;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: string;
  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'org',
  })
  organization: Organization;

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
