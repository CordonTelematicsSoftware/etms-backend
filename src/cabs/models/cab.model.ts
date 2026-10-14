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
import sequelize from 'sequelize';
import { Status } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Brand } from 'src/brands/models/brand.model';
import { Driver } from 'src/drivers/models/driver.model';
import { CabDocumentUpload } from './cabDocumentUpload.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Cab extends Model {
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

  @ForeignKey(() => Driver)
  @Column(sequelize.BIGINT)
  driverID: bigint;

  @BelongsTo(() => Driver, {
    foreignKey: 'driverID',
    as: 'driver',
  })
  driver: Driver;

  @ForeignKey(() => Driver)
  @Column(sequelize.BIGINT)
  driver2ID: bigint;

  @BelongsTo(() => Driver, {
    foreignKey: 'driver2ID',
    as: 'driver2',
  })
  driver2: Driver;

  @Column
  regNo: string;

  @Column
  imei: string;

  @Column
  rcOwner: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  rcExpiry: Date;

  @Column
  color: string;

  @Column
  noOfSeats: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  insuranceEndDate: Date;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  pollutionEndDate: Date;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  manufacturingDate: Date;

  @ForeignKey(() => Brand)
  @Column(sequelize.BIGINT)
  brandID: bigint;

  @BelongsTo(() => Brand, {
    foreignKey: 'brandID',
    as: 'brand',
  })
  brand: Brand;

  @Column
  model: string;

  @Column
  fuelType: string;
  @Column
  insuranceNumber: string;

  @Column
  insuranceProvider: string;

  @Column
  subVendor: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  permitExpiry: Date;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  fitnessExpiry: Date;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  taxExpiry: Date;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  @HasMany(() => CabDocumentUpload, {
    foreignKey: 'cabID',
    as: 'documents',
  })
  documents: CabDocumentUpload[];
}
