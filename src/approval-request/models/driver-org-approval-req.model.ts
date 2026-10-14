import {
  Column,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  BelongsTo,
  ForeignKey,
  DataType,
  HasMany,
} from 'sequelize-typescript';
import { Status } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Driver } from 'src/drivers/models/driver.model';
import { Organization } from 'src/organization/models/organization.model';
import { DriverOrgRequestDocumentUpload } from './driver-org-req-document-upload.model';

@Table({
  tableName: 'OrgDriverRequests',
  paranoid: true,
})
export class OrgDriverRequest extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(DataType.BIGINT)
  id: bigint;

  @ForeignKey(() => Organization)
  @Column(DataType.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @ForeignKey(() => Vendor)
  @Column(DataType.BIGINT)
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  @ForeignKey(() => Driver)
  @Column(DataType.BIGINT)
  driverID: bigint;

  @BelongsTo(() => Driver, {
    foreignKey: 'driverID',
    as: 'driver',
  })
  driver: Driver;

  @Column
  name: string;

  @Column
  code: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  email: string;

  @Column
  phone: string;

  @Column
  address: string;

  @Column
  aadharNumber: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  dob: Date;

  @Column({
    allowNull: true,
  })
  image: string;

  @Column
  licenseNo: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  licenseExpiry: Date;

  @Column
  badgeNo: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  badgeExpiry: Date;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  bgVerificationExpiry: Date;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  policeClearenceExpiry: Date;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  medFitExpiry: Date;

  @Column({
    defaultValue: Status.Active,
    allowNull: true,
  })
  status: Status;

  @Column
  defaultCabRegNo: string;

  @HasMany(() => DriverOrgRequestDocumentUpload, {
    foreignKey: 'driverOrgRequestID',
    as: 'documents',
  })
  documents: DriverOrgRequestDocumentUpload[];
}
