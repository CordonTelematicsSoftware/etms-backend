import sequelize from 'sequelize';
import {
  Column,
  Model,
  Table,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { Employee } from 'src/employee/models/employee.model';
import { Organization } from 'src/organization/models/organization.model';
import { Status } from 'src/shared/enums';
@Table
export class Location extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column
  geoCode: string;

  @Column
  tripTime: bigint;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  //  Add this isLocked column to lock the zone if there are any employees assigned to it. This will prevent  modification of the zone until it is unlocked.
  @Column({ defaultValue: false, allowNull: false })
  isLocked: boolean;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @HasMany(() => Employee, { foreignKey: 'locationID', as: 'employees' })
  employees: Employee[];
  // Delay factor jsonB  starttime - endtime delayfactor eg: 2*10
}
