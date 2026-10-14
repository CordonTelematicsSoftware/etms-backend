import {
  Column,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  DataType,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Gender, Status } from 'src/shared/enums';
import { Organization } from 'src/organization/models/organization.model';
import { SecurityAttendance } from './securityAttendance.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Security extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column
  securityCode: string;

  @Column({ allowNull: true })
  gender: Gender;

  @Column
  phone1: string;

  @Column
  phone2: string;

  @Column
  address: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  dob: Date;

  @Column
  bloodGroup: string;

  @Column
  emergencyContactNo: string;

  @Column
  emergencyContactName: string;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @HasMany(() => SecurityAttendance, {
    foreignKey: 'spockID',
    as: 'securityAttendance',
  })
  securityAttendance: SecurityAttendance[];

  @Column
  aadharNumber: string;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;
}
