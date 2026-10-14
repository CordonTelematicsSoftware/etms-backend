import sequelize from 'sequelize';
import {
  AutoIncrement,
  Column,
  ForeignKey,
  Model,
  PrimaryKey,
  BelongsTo,
  Table,
} from 'sequelize-typescript';
import { Organization } from 'src/organization/models/organization.model';
import { Status } from 'src/shared/enums';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Process extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column
  description: string;
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
