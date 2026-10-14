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
import { Employee } from 'src/employee/models/employee.model';
import { Organization } from 'src/organization/models/organization.model';

/**
 * Idempotency ledger for the schedule-cutoff reminder.
 *
 * One row per (employee, booking period) that has been reminded. The unique
 * constraint on (employeeID, cutoffPeriodKey) — migration
 * 50260817000001-create-schedule-reminder-logs.js — is what makes a second cron
 * fire for the same period a no-op rather than a duplicate push.
 *
 * NOT paranoid: a soft-deleted row would still occupy the unique slot, so
 * deletedAt would add no capability. Rows are append-only.
 */
@Table({
  tableName: 'ScheduleReminderLogs',
  timestamps: true,
  paranoid: false,
})
export class ScheduleReminderLog extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @ForeignKey(() => Employee)
  @Column({ type: DataType.BIGINT, allowNull: false })
  employeeID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    as: 'employee',
  })
  employee: Employee;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.BIGINT, allowNull: false })
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  /**
   * The booking PERIOD this reminder covered, not the time the cron ran.
   * e.g. "daily:2026-08-18", "weekly:2026-W35", "monthly:2026-09".
   */
  @Column({ type: DataType.STRING, allowNull: false })
  cutoffPeriodKey: string;

  /** daily | weekly | monthly. hourly is not reminded on in v1. */
  @Column({ type: DataType.STRING, allowNull: false })
  mode: string;

  /** pick | drop — the leg whose cutoff triggered this reminder. */
  @Column({ type: DataType.STRING, allowNull: true })
  leg: string;

  /** The cutoff instant this reminder was fired ahead of. */
  @Column({ type: DataType.DATE, allowNull: true })
  cutoffAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  sentAt: Date;

  /**
   * NotificationLog id from the dispatcher, for tracing a reminder to its
   * delivery attempt. Not an FK — notify() returns zero log ids when an org has
   * no enabled channel configuration.
   */
  @Column({ type: DataType.STRING, allowNull: true })
  notificationLogId: string;
}
