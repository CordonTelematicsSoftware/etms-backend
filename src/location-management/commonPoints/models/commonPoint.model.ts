import sequelize from 'sequelize';
import {
  Column,
  Model,
  Table,
  PrimaryKey,
  AutoIncrement,
  BelongsTo,
  ForeignKey,
  //   HasMany,
} from 'sequelize-typescript';
import { Organization } from 'src/organization/models/organization.model';
import { Status } from 'src/shared/enums';

@Table
export class CommonPoint extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column
  geoCode: string;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;
}
