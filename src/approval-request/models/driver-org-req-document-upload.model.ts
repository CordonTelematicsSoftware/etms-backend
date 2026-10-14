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
import { Driver } from 'src/drivers/models/driver.model';
import { OrgDriverRequest } from './driver-org-approval-req.model';

@Table({
  tableName: 'DriverOrgRequestDocumentUploads',
})
export class DriverOrgRequestDocumentUpload extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column({ allowNull: true })
  title: string;

  @Column({ allowNull: true })
  url: string;

  @ForeignKey(() => Vendor)
  @Column(sequelize.BIGINT)
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  @ForeignKey(() => Driver)
  @Column(sequelize.BIGINT)
  driverID: bigint;

  @BelongsTo(() => Driver, {
    foreignKey: 'driverID',
    as: 'driver',
  })
  driver: Driver;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @ForeignKey(() => OrgDriverRequest)
  @Column(sequelize.BIGINT)
  driverOrgRequestID: bigint;

  @BelongsTo(() => OrgDriverRequest, {
    foreignKey: 'driverOrgRequestID',
    as: 'driverOrgRequest',
  })
  driverOrgRequest: OrgDriverRequest;
}
