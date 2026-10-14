import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  BelongsTo,
  ForeignKey,
  AutoIncrement,
  HasMany,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Status } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { DriverDocumentUpload } from './driverDocumentUpload.model';
import { DriverAuthentication } from 'src/auth/models/driver-auth.model';
import { DriverDeviceInfo } from 'src/auth/models/driver-device-model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Driver extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column
  code: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  email: string;

  @Column
  phone: string;

  @Column
  address: string;

  @Column
  aadharNumber: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  dob: Date;

  @Column({ allowNull: true })
  image: string;

  @Column
  licenseNo: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  licenseExpiry: Date;

  @Column
  badgeNo: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  badgeExpiry: Date;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  bgVerificationExpiry: Date;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  policeClearenceExpiry: Date;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  medFitExpiry: Date;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  @Column
  defaultCabRegNo: string;

  @ForeignKey(() => Vendor)
  @Column(sequelize.BIGINT)
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'role',
  })
  vendor: Vendor;

  @ForeignKey(() => DriverAuthentication)
  @Column(sequelize.BIGINT)
  driverAuthID: bigint;

  @BelongsTo(() => DriverAuthentication, {
    foreignKey: 'driverAuthID',
    as: 'driverAuth',
  })
  driverAuth: DriverAuthentication;

  @HasMany(() => DriverDocumentUpload, {
    foreignKey: 'driverID',
    as: 'documents',
  })
  documents: DriverDocumentUpload[];

  @HasMany(() => DriverDeviceInfo, {
    foreignKey: 'driverID',
    as: 'driverDeviceInfo',
  })
  driverDeviceInfo: DriverDeviceInfo[];
}
