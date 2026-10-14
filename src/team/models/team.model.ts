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
import { Organization } from 'src/organization/models/organization.model';
import { Process } from 'src/process/models/process.model';
import { Status } from 'src/shared/enums';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Team extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  // @Column({ allowNull: true })
  // shiftLoginTime: string;

  // @Column({ allowNull: true })
  // shiftLogoutTime: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
  })
  shiftLoginTime: string[];

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
  })
  shiftLogoutTime: string[];

  @Column({ defaultValue: false, allowNull: true })
  isShiftEnabled: boolean;

  @ForeignKey(() => Process)
  @Column(sequelize.BIGINT)
  processID: bigint;
  @BelongsTo(() => Process, {
    foreignKey: 'processID',
    as: 'process',
  })
  process: Process;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @Column({ defaultValue: false, allowNull: true })
  isTeamConfigEnabled: boolean;

  @Column({ type: DataType.JSONB, allowNull: true })
  teamConfig: any;

  @Column({ type: DataType.ARRAY(DataType.STRING), allowNull: true })
  workHours: string[];

  @Column({
    defaultValue: false,
    allowNull: true,
  })
  isAutoLogoutEnabled: boolean;
}
