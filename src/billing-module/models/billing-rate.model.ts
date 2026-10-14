import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  BelongsTo,
  ForeignKey,
  AutoIncrement,
} from 'sequelize-typescript';
import { Organization } from 'src/organization/models/organization.model';
import { BillingPlans } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class BillingRate extends Model {
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

  @Column({
    type: DataType.ENUM(
      BillingPlans.PerKMBilling,
      BillingPlans.PerTripSlabBilling,
      BillingPlans.PerTripMultiSlabBilling,
    ),
    allowNull: false,
  })
  billingPlan: string;

  @Column(DataType.INTEGER)
  seats: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  ratePerKm: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  baseFare: number;

  @Column({ type: DataType.BIGINT, allowNull: true })
  thresholdKm: bigint;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  additionalRatePerKm: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  securityAmount: number;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  multiSlabRates: any;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  updatedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  deletedAt: Date;
}
