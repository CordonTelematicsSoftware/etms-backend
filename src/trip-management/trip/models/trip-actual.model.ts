import sequelize from 'sequelize';
import {
  AutoIncrement,
  Column,
  Model,
  PrimaryKey,
  Table,
  BelongsTo,
  DataType,
} from 'sequelize-typescript';
import { Trip } from './trip.model';
import { BillingRate } from 'src/billing-module/models/billing-rate.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class TripActual extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  tripID: bigint;

  @BelongsTo(() => Trip, {
    foreignKey: 'tripID',
    as: 'trip',
  })
  trip: Trip;

  @Column({ allowNull: true })
  actualOccupancy: string;

  @Column({ allowNull: true })
  actualStartDate: string;

  @Column({ allowNull: true })
  actualStartTime: string;

  @Column({ allowNull: true })
  actualEndDate: string;

  @Column({ allowNull: true })
  actualEndTime: string;

  @Column({ allowNull: true })
  actualDistance: string;

  @Column({ allowNull: true })
  actualCost: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  securityAmount: number;

  @Column({
    type: DataType.JSONB, // Use JSONB for PostgreSQL (or JSON if using another DB)
    allowNull: true,
  })
  billingRate: BillingRate;

  @Column({ allowNull: true })
  remarks: string;

  // Admin-entered cost that replaces the computed actualCost. Stored as a
  // string to mirror actualCost exactly (both are VARCHAR in TripActuals).
  @Column({ allowNull: true })
  actualCostOverride: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  isCostOverridden: boolean;
}
