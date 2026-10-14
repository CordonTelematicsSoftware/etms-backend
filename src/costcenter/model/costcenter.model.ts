import {
  Column,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Process } from 'src/process/models/process.model';
import { Team } from 'src/team/models/team.model';
import { Status } from 'src/shared/enums';
import { Organization } from 'src/organization/models/organization.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Costcenter extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @ForeignKey(() => Process)
  @Column(sequelize.BIGINT)
  processID: bigint;

  @BelongsTo(() => Process, {
    foreignKey: 'processID',
    as: 'process',
  })
  process: Process;

  @ForeignKey(() => Team)
  @Column(sequelize.BIGINT)
  teamID: bigint;

  @BelongsTo(() => Team, {
    foreignKey: 'teamID',
    as: 'team',
  })
  team: Team;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;
}
