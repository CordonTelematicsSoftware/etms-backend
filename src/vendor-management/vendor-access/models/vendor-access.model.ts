// src/vendor-management/vendor-access/models/vendor-access.model.ts
import sequelize from 'sequelize';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Authentication } from 'src/auth/models/authentication.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class VendorAccess extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column({ type: DataType.STRING(100), validate: { isEmail: true } })
  email: string;

  @ForeignKey(() => Vendor)
  @Column(sequelize.BIGINT)
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  // Orgs (subset of the vendor's own approved orgs) this sub-login may access.
  // Empty/null = no restriction beyond the vendor's own approved list (shouldn't
  // normally happen post-migration, since addAccess always requires at least one).
  @Column({ type: DataType.ARRAY(sequelize.BIGINT), defaultValue: [] })
  orgIDs: bigint[];

  // Direct link to the Authentication row this access entry created —
  // lets every restriction check match on the logged-in user's id (session.userID)
  // without re-deriving identity via email.
  @ForeignKey(() => Authentication)
  @Column(sequelize.BIGINT)
  authID: bigint;

  @BelongsTo(() => Authentication, {
    foreignKey: 'authID',
    as: 'auth',
  })
  auth: Authentication;
}
