import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * A TypeScript union rather than a DB enum, matching
 * ScheduleReminderSchedule.status. Trip.status is a Postgres ENUM and adding a
 * value there needs a migration; these are worker states that may well gain a
 * member, so they stay a plain STRING column checked in code.
 */
export type TripSaveJobStatus = 'pending' | 'running' | 'done' | 'failed';

/** Which TripService method the worker calls for this job. */
export type TripSaveJobKind = 'create' | 'update';

/**
 * One queued Routing-page save.
 *
 * NOT paranoid: the nightly prune must actually DELETE rows, and a soft-delete
 * column would only hide the ones it is meant to remove. Same reasoning as
 * ScheduleReminderSchedule.
 *
 * No @BelongsTo(Organization): nothing eager-loads the org off a job, and the
 * FK lives in the migration where it does its work. Keeping the association off
 * the model avoids adding an unused include path to the Trip module's models.
 */
@Table({
  tableName: 'TripSaveJobs',
  timestamps: true,
  paranoid: false,
})
export class TripSaveJob extends Model<TripSaveJob> {
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  id: bigint;

  /** Tenancy boundary — findOneStatus filters on it. */
  @Column({ type: DataType.BIGINT, allowNull: false })
  orgID: bigint;

  @Column({ type: DataType.STRING, allowNull: false })
  kind: TripSaveJobKind;

  /**
   * CreateTripInput[] for 'create', UpdateTripInput for 'update'.
   * NULLed by finish() — see the model doc on context.
   */
  @Column({ type: DataType.JSONB, allowNull: true })
  payload: any;

  /**
   * { user: { id, orgID, name, userType, vendorID }, shiftTime, date }
   *
   * Snapshotted at enqueue time and never re-derived. A SuperAdmin who switched
   * into an org has that fact only in the live session; the Authentication row
   * is switch-oblivious, so re-reading it at execute time would log and scope
   * the save to the wrong org (eventlog.service.ts:34-60).
   *
   * NULLed by finish() alongside payload: nothing reads either again, because
   * there is no retry.
   */
  @Column({ type: DataType.JSONB, allowNull: true })
  context: any;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'pending',
  })
  status: TripSaveJobStatus;

  /**
   * Incremented by the claim UPDATE itself, so the count cannot drift from the
   * number of times a process actually took ownership. The cap is 1: reaching 2
   * means the first run died mid-flight, and that job is failed rather than
   * re-run. See TripSaveJobWorkerService for why re-running is unsafe.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  attempts: number;

  @Column({ type: DataType.DATE, allowNull: true })
  claimedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  finishedAt: Date | null;

  @Column({ type: DataType.STRING, allowNull: true })
  error: string | null;

  /** TripService's own success message, e.g. "12 trips created successfully." */
  @Column({ type: DataType.STRING, allowNull: true })
  resultMessage: string | null;
}
