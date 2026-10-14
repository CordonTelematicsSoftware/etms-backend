import sequelize from 'sequelize';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Organization } from 'src/organization/models/organization.model';
import { Status } from 'src/shared/enums';
import { Team } from 'src/team/models/team.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Announcement extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  title: string;

  @Column
  description: string;

  @Column
  endDate: Date;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  // NEW — nullable, org-wide announcements leave this null
  @ForeignKey(() => Team)
  @Column({ type: sequelize.BIGINT, allowNull: true })
  teamID: bigint;

  @BelongsTo(() => Team, {
    foreignKey: 'teamID',
    as: 'team',
  })
  team: Team;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;
}
