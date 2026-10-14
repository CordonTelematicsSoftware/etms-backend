import {
  Column,
  DataType,
  Model,
  Table,
  // AutoIncrement,
  HasOne,
  ForeignKey,
  BelongsTo,
  AllowNull,
  // AllowNull,
} from 'sequelize-typescript';
import { UserType } from '../../shared/enums';
// import sequelize from 'sequelize';
import { Administrator } from '../../administrator/models/administrator.model';
import sequelize from 'sequelize';
import { Role } from 'src/role/models/role.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class User extends Model {
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
  })
  id: bigint;

  @Column
  phone: string;

  @Column
  email: string;
  @Column
  deviceToken: string;

  @Column
  hashedPassword: string;

  @Column({ type: sequelize.DATE })
  lastLogin: Date;

  @Column({
    type: DataType.ENUM,
    values: [UserType.SuperAdmin, UserType.Admin, UserType.Member],
    defaultValue: UserType.Admin,
  })
  userType: string;

  @ForeignKey(() => Role)
  @Column(sequelize.BIGINT)
  roleID: bigint;

  @BelongsTo(() => Role, {
    foreignKey: 'roleID',
  })
  role: Role;

  @Column({ type: DataType.ARRAY(DataType.STRING(100)) })
  permissions: string[];

  @AllowNull(true)
  @Column({ defaultValue: 0 })
  failedLoginAttempts: number;

  @AllowNull(true)
  @Column({ defaultValue: 0 })
  otpResendAttempts: number;

  @HasOne(() => Administrator, { foreignKey: 'userID', as: 'admin' })
  admin: Administrator;
}
