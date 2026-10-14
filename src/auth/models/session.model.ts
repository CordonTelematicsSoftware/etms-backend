import {
  Column,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  DataType,
  ForeignKey,
  AllowNull,
  BelongsTo,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { User } from '../../user/models/user.model';
import { UserType } from 'src/shared/enums';
import { Employee } from 'src/employee/models/employee.model';
import { Organization } from 'src/organization/models/organization.model';
import { VendorUser } from 'src/vendor-management/vendor-user/models/vendor-user.model';
import { Authentication } from './authentication.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Role } from 'src/role/models/role.model';
import { Driver } from 'src/drivers/models/driver.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Session extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @ForeignKey(() => User)
  @Column(sequelize.BIGINT)
  userID: bigint;

  @BelongsTo(() => Authentication, {
    foreignKey: 'userID',
    as: 'user',
  })
  user: Authentication;

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(false)
  @Column
  token: string;

  @AllowNull(true)
  @Column
  expiry: Date;

  @Column({
    type: DataType.ENUM,
    values: [
      UserType.SuperAdmin,
      UserType.Employee,
      UserType.Admin,
      UserType.Vendor,
    ],
    defaultValue: UserType.Employee,
  })
  userType: string;

  @Column({ type: DataType.ARRAY(DataType.STRING(100)) })
  permissions: string[];

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  employeeID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    constraints: false,
    as: 'employee',
  })
  employee: Employee;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

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

  @ForeignKey(() => Driver)
  @Column(sequelize.BIGINT)
  driverID: bigint;

  @BelongsTo(() => Driver, {
    foreignKey: 'driverID',
    as: 'driver',
  })
  driver: Driver;

  @AllowNull(false)
  @Column({ defaultValue: false })
  invalidated: boolean;

  @ForeignKey(() => Role)
  @Column(sequelize.BIGINT)
  roleID: bigint;

  @BelongsTo(() => Role, {
    foreignKey: 'roleID',
    as: 'role',
  })
  role: Role;
}
