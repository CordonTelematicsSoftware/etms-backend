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
import { Driver } from './driver.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class DriverDocumentUpload extends Model {
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
}
