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
import { Authentication } from 'src/auth/models/authentication.model';
import { Organization } from 'src/organization/models/organization.model';
import { RequestStatus } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';

@Table({
  timestamps: true,
  paranoid: true,
  tableName: 'VendorOrganizations',
})
export class VendorRequest extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

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

  @Column({ defaultValue: RequestStatus.Pending, allowNull: true })
  requestStatus: RequestStatus;

  @Column({ allowNull: true })
  description: string;

  @Column({ allowNull: true })
  reason: string;

  @ForeignKey(() => Authentication)
  @Column(sequelize.BIGINT)
  createdBy: bigint;

  @BelongsTo(() => Authentication, {
    foreignKey: 'createdBy',
    as: 'createdByUser',
  })
  createdByUser: Authentication;
}
