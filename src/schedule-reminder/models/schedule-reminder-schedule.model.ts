import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';

import { Organization } from 'src/organization/models/organization.model';
import { Team } from 'src/team/models/team.model';

import { CutoffLeg } from '../utils/cutoff-deadline.util';

export type ScheduleReminderScheduleStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'skipped';

/**
 * One upcoming hourly-cutoff reminder instant.
 *
 * NOT paranoid: rows are generated forward and pruned behind, so a soft-delete
 * column would only hide rows the prune is meant to remove.
 */
@Table({
  tableName: 'ScheduleReminderSchedules',
  timestamps: true,
  paranoid: false,
})
export class ScheduleReminderSchedule extends Model<ScheduleReminderSchedule> {
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  id: bigint;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.BIGINT, allowNull: false })
  orgID: bigint;

  @BelongsTo(() => Organization)
  organization: Organization;

  /** NULL means the row is org-level rather than team-scoped. */
  @ForeignKey(() => Team)
  @Column({ type: DataType.BIGINT, allowNull: true })
  teamID: bigint | null;

  @BelongsTo(() => Team)
  team: Team;

  @Column({ type: DataType.STRING, allowNull: false })
  leg: CutoffLeg;

  /** 'HH:mm'. Pick uses Login time, drop uses Logout time. */
  @Column({ type: DataType.STRING, allowNull: false })
  shiftTime: string;

  /**
   * 'YYYY-MM-DD'. Kept as a string to match TripRequests."date", which is
   * varchar — comparisons against it are lexicographic, not temporal.
   */
  @Column({ type: DataType.STRING, allowNull: false })
  tripDate: string;

  /** shiftInstant - upperCutoff hours: when the booking window opens. */
  @Column({ type: DataType.DATE, allowNull: false })
  runAt: Date;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'pending',
  })
  status: ScheduleReminderScheduleStatus;

  /**
   * Failed dispatch attempts. At the poller's cap the row is written 'skipped'
   * instead of back to 'pending', so a permanently failing row stops being
   * re-selected and stops starving the rows behind it.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  attempts: number;

  @Column({ type: DataType.DATE, allowNull: true })
  claimedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  finishedAt: Date | null;

  @Column({ type: DataType.STRING, allowNull: true })
  error: string | null;
}
