import {
  Column,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Organization } from 'src/organization/models/organization.model';
import { CabOrgRequest } from './cab-org-approval-req.model';
import { Cab } from 'src/cabs/models/cab.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class CabOrgRequestDocumentUpload extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column({
    allowNull: false,
  })
  title: string;

  @Column({
    allowNull: false,
  })
  url: string;

  @ForeignKey(() => Vendor)
  @Column(sequelize.BIGINT)
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  @ForeignKey(() => Cab)
  @Column(sequelize.BIGINT)
  cabID: bigint;

  @BelongsTo(() => Cab, {
    foreignKey: 'cabID',
    as: 'cab',
  })
  cab: Cab;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @ForeignKey(() => CabOrgRequest)
  @Column(sequelize.BIGINT)
  cabOrgRequestID: bigint;

  @BelongsTo(() => CabOrgRequest, {
    foreignKey: 'cabOrgRequestID',
    as: 'cabOrgRequest',
  })
  cabOrgRequest: CabOrgRequest;
}
