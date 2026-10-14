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
import { Cab } from './cab.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class CabDocumentUpload extends Model {
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

  @ForeignKey(() => Cab)
  @Column(sequelize.BIGINT)
  cabID: bigint;

  @BelongsTo(() => Cab, {
    foreignKey: 'cabID',
    as: 'cab',
  })
  cab: Cab;
}
