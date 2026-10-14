import {
  Column,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  AllowNull,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Employee } from 'src/employee/models/employee.model';
import { VendorUser } from 'src/vendor-management/vendor-user/models/vendor-user.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Authentication extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  email: string;

  @Column
  phone: string;

  @Column
  name: string;

  @Column
  hashedPassword: string;

  @Column({ type: sequelize.DATE })
  passwordCreatedAt: Date;

  // @Column
  // passwordResetToken: string;

  @Column
  hashedOtp: string;

  @Column({ type: sequelize.DATE })
  otpCreatedAt: Date;

  @Column
  userType: string;

  @Column
  status: string;

  @AllowNull(false)
  @Column({ defaultValue: 0 })
  failedLoginAttempts: number;

  @AllowNull(true)
  @Column({ type: sequelize.DATE })
  reActivationTime: Date;

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  employeeID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    as: 'employee',
  })
  employee: Employee;

  @ForeignKey(() => VendorUser)
  @Column(sequelize.BIGINT)
  vendorUserID: bigint;

  @BelongsTo(() => VendorUser, {
    foreignKey: 'vendorUserID',
    as: 'vendorUser',
  })
  vendorUser: VendorUser;

  @ForeignKey(() => Vendor)
  @Column(sequelize.BIGINT)
  vendorID: bigint;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  @Column({ type: sequelize.DATE })
  lastLogin: Date;

  @Column
  passwordResetToken: string;

  @AllowNull(true)
  @Column({ defaultValue: 0 })
  noShowCount: number;

  // @BelongsTo(() => Employee, {
  //   foreignKey: 'referenceID',
  //   constraints: false,
  //   as: 'employee',
  // })
  // employee: Employee;
}
