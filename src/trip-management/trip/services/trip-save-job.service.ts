import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { literal, Op, QueryTypes, Sequelize } from 'sequelize';
import * as moment from 'moment';

import { GenericResponse } from 'src/shared/interfaces/generic-response';
import {
  TripSaveJob,
  TripSaveJobKind,
  TripSaveJobStatus,
} from '../models/trip-save-job.model';

/**
 * How long a 'running' row may sit before another process may take it over.
 *
 * 5 minutes, not the poller's 30: a Routing-page save peaks around two minutes,
 * so five clears the longest legitimate run with margin while still surfacing a
 * crashed job to the waiting operator quickly. Taking a stale row over does NOT
 * re-run it — see the attempts cap in TripSaveJobWorkerService.
 */
export const STALE_CLAIM_MINUTES = 5;

/**
 * Ceiling on a single enqueued payload.
 *
 * Without this the operator gets body-parser's opaque PayloadTooLargeError with
 * no indication of what to do. Checked here rather than in the controller so
 * both enqueue routes are covered and neither can forget it.
 *
 * 40 MB sits under the 50 MB body limit main.ts:23 sets — but ONLY on the PM2
 * entrypoint. lambda.ts sets no body limit at all, so there the effective cap
 * is Nest's 100 kb default and a real payload is rejected by body-parser long
 * before it reaches this check. That divergence is pre-existing and shared with
 * the sync routes; it is not fixed here, only named.
 */
export const MAX_PAYLOAD_BYTES = 40 * 1024 * 1024;

/**
 * Written onto any job that is failed without being executed to completion.
 *
 * Deliberately not "the save failed": when a job dies mid-run we genuinely do
 * not know how far TripService.create() got, and it commits inside its own
 * transaction (trip.service.ts:387). Telling the operator to reload and look is
 * the only honest instruction, and it is also the one that prevents the
 * duplicate-routeNumber trap a blind retry would spring.
 */
export const INDETERMINATE_MESSAGE =
  'This save may have completed. Reload the page to check before saving again.';

/** Columns safe to hand back to a polling client. Never payload or context. */
const STATUS_ATTRIBUTES = [
  'id',
  'kind',
  'status',
  'attempts',
  'error',
  'resultMessage',
  'createdAt',
  'claimedAt',
  'finishedAt',
];

@Injectable()
export class TripSaveJobService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(TripSaveJob)
    private readonly jobModel: typeof TripSaveJob,
  ) {}

  /**
   * Queue one save. Returns the new row's id; the caller hands that to the
   * client, which polls findOneStatus until the job leaves 'pending'/'running'.
   */
  async enqueue(
    kind: TripSaveJobKind,
    payload: any,
    context: any,
    orgID: any,
  ): Promise<bigint> {
    this.assertOrgSelected(orgID);
    this.assertPayloadWithinLimit(payload);

    const dedupKeys = this.deriveShiftKeys(kind, payload, context);
    await this.assertNoSaveInFlight(orgID, kind, dedupKeys);

    const job = await this.jobModel.create({
      orgID,
      kind,
      // dedupKeys rides on context because the alternative is reading every
      // in-flight row's payload — the 6 MB column this whole design exists to
      // keep off the request path. finish() NULLs context, and only
      // pending/running rows are ever inspected, so the keys die with the job.
      context: { ...(context ?? {}), dedupKeys },
      payload,
      status: 'pending',
      attempts: 0,
    } as any);

    return job.id;
  }

  /**
   * The (date, shiftTime) pairs this payload touches, as date|shiftTime.
   *
   * 'update' takes them from the query params the controller snapshotted into
   * context (trip.controller.ts:134). 'create' derives them from the payload
   * rows, skipping any row missing either field — the same filter create()
   * itself applies when it builds its dedup keys (trip.service.ts:167). A set,
   * not a single value: a create payload may legitimately span more than one
   * shift, and create() already handles that case.
   */
  private deriveShiftKeys(
    kind: TripSaveJobKind,
    payload: any,
    context: any,
  ): string[] {
    const keys = new Set<string>();

    if (kind === 'update') {
      if (context?.date && context?.shiftTime) {
        keys.add(`${context.date}|${context.shiftTime}`);
      }
      return [...keys];
    }

    for (const row of Array.isArray(payload) ? payload : []) {
      if (!row?.date || !row?.shiftTime) continue;
      keys.add(`${row.date}|${row.shiftTime}`);
    }

    return [...keys];
  }

  /**
   * Reject a second save of a shift that already has one queued or running.
   *
   * This is the double-click fix. Without it both clicks enqueue, the worker
   * runs them in turn, and the second one fails — for 'create' on create()'s own
   * dedup guard (trip.service.ts:206-218) after the operator has already waited
   * through two full runs, and for 'update' not at all, since no equivalent
   * guard exists on that path.
   *
   * CHECK-THEN-INSERT, and deliberately not closed further. Two genuinely
   * simultaneous requests can still both pass this SELECT; shutting that window
   * needs the unique index the migration rules out on purpose. What this does
   * close is the real failure — two clicks hundreds of milliseconds apart.
   *
   * The row set is tiny by construction (the worker runs one job at a time) and
   * trip_save_jobs_status_id covers the status filter. The intersection is done
   * in JS rather than with Postgres's ?| jsonb operator because ? collides
   * with Sequelize's positional-replacement parsing.
   */
  private async assertNoSaveInFlight(
    orgID: any,
    kind: TripSaveJobKind,
    dedupKeys: string[],
  ): Promise<void> {
    // No key could be derived — an update called without the query params, or a
    // create whose rows carry no date/shiftTime. Proceed and leave it to
    // TripService's own guards: rejecting here would break saves that work
    // today.
    if (dedupKeys.length === 0) {
      return;
    }

    const inFlight = await this.jobModel.findAll({
      where: { orgID, kind, status: { [Op.in]: ['pending', 'running'] } },
      attributes: ['id', 'context'],
    });

    const incoming = new Set(dedupKeys);
    // A row enqueued by the previous deploy carries no dedupKeys and is
    // invisible here. Self-clearing within one job's runtime.
    const clash = inFlight.find((job) => {
      const keys = job.context?.dedupKeys;
      return Array.isArray(keys) && keys.some((key) => incoming.has(key));
    });

    if (clash) {
      throw new BadRequestException(
        'A save is already in progress for this shift. ' +
          'Wait for it to finish before saving again.',
      );
    }
  }

  /**
   * Status poll.
   *
   * Scoped by orgID so one org cannot read another's job, and deliberately
   * narrow on attributes: payload holds the operator's full 6 MB route set and
   * echoing it back on a 2-second poll would move more bytes than the original
   * save did.
   */
  async findOneStatus(
    id: number,
    orgID: any,
  ): Promise<GenericResponse<TripSaveJob>> {
    this.assertOrgSelected(orgID);

    const job = await this.jobModel.findOne({
      where: { id, orgID },
      attributes: STATUS_ATTRIBUTES,
    });

    if (!job) {
      throw new NotFoundException('Save job not found.');
    }

    return {
      message: 'Save job status fetched successfully.',
      data: job,
    };
  }

  /**
   * The worker's scan: oldest claimable job, or null. One at a time.
   *
   * The staleness cutoff is the DB clock, not the app clock, so it cannot
   * disagree with claim()'s predicate below. Computing it here with moment()
   * would mean the SELECT and the UPDATE resolve "5 minutes ago" against two
   * different clocks: if the app host runs ahead of the DB, this returns a row
   * that claim() then refuses, runOnce() gives up for the tick, and every
   * queued save sits behind that one unclaimable row until the skew passes.
   *
   * STALE_CLAIM_MINUTES is a module constant, so interpolating it into the
   * literal carries no user input.
   */
  async findNextClaimable(): Promise<TripSaveJob | null> {
    const staleClaimBefore = literal(
      `now() - (${STALE_CLAIM_MINUTES} * interval '1 minute')`,
    );

    return this.jobModel.findOne({
      where: {
        [Op.or]: [
          { status: 'pending' },
          { status: 'running', claimedAt: { [Op.lt]: staleClaimBefore } },
        ],
      },
      attributes: ['id', 'kind', 'orgID', 'attempts'],
      order: [['id', 'ASC']],
    });
  }

  /** Full row, for the worker to execute. Only called on a claimed job. */
  async findForExecution(id: bigint): Promise<TripSaveJob | null> {
    return this.jobModel.findOne({ where: { id } });
  }

  /**
   * Claim a row, atomically.
   *
   * Same shape as ScheduleReminderPollerService.claim (poller :178-193), and
   * for the same reason: there is no advisory lock or leader election anywhere
   * in this codebase, and exec_mode "cluster" means several processes can hold
   * live timers. The conditional UPDATE is the only arbiter — whichever process
   * flips the row wins and the rest get zero rows back.
   *
   * One addition over the poller: attempts is incremented by this same
   * statement, so the count can never drift from the number of times a process
   * actually took ownership, and the caller learns which attempt it is holding
   * without a second read that another process could interleave with.
   */
  async claim(id: bigint): Promise<{ claimed: boolean; attempts: number }> {
    const [rows] = await this.sequelize.query(
      `UPDATE "TripSaveJobs"
          SET "status" = 'running',
              "claimedAt" = now(),
              "attempts" = "attempts" + 1,
              "updatedAt" = now()
        WHERE "id" = :id
          AND ("status" = 'pending'
               OR ("status" = 'running'
                   AND "claimedAt" < now() - (:staleMinutes * interval '1 minute')))
     RETURNING "attempts"`,
      {
        replacements: { id: String(id), staleMinutes: STALE_CLAIM_MINUTES },
        type: QueryTypes.UPDATE,
      },
    );

    const claimedRows = (rows ?? []) as Array<{ attempts: number }>;

    return {
      claimed: claimedRows.length > 0,
      attempts: Number(claimedRows[0]?.attempts ?? 0),
    };
  }

  /**
   * Fail 'pending' rows that were never claimed, and report how many.
   *
   * claim()'s staleness predicate only reaps 'running' (:186-188), so a row
   * whose process died between the insert and the claim — or one enqueued while
   * no worker was up — stays pending until the 7-day prune while the page polls
   * it forever. This is the only thing that ends that wait.
   *
   * The NOT EXISTS is what makes the age test safe. A bare "older than N
   * minutes" rule fails a row that is merely QUEUED: the worker takes one job
   * per tick, so the fifth save of a busy shift legitimately sits pending well
   * past ten minutes, and failing it would send the operator back to re-save an
   * update that was about to run — straight into the duplicate-routeNumber trap
   * MAX_ATTEMPTS exists to avoid. With a running row present the queue is
   * draining and nothing is stuck; the sweep stands down. Not scoped by orgID,
   * because the worker is not either: one running job anywhere holds the line
   * for every org.
   *
   * DB clock, for the same reason findNextClaimable() uses it (:129-141) —
   * app/DB skew must not let this and claim() disagree about which rows are old.
   * status = 'pending' in the WHERE is the arbiter against a concurrent claim(),
   * exactly as claim() is against another process: whichever UPDATE lands first,
   * the other matches zero rows.
   *
   * Wipes payload and context like finish() does, and for the same reason: an
   * aged-out row must not keep the operator's route set for the full seven days.
   */
  async failStalePending(minutes: number): Promise<number> {
    const [rows] = await this.sequelize.query(
      `UPDATE "TripSaveJobs"
          SET "status" = 'failed',
              "error" = :message,
              "resultMessage" = NULL,
              "finishedAt" = now(),
              "payload" = NULL,
              "context" = NULL,
              "updatedAt" = now()
        WHERE "status" = 'pending'
          AND "createdAt" < now() - (:minutes * interval '1 minute')
          AND NOT EXISTS (
                SELECT 1 FROM "TripSaveJobs" WHERE "status" = 'running'
              )
     RETURNING "id"`,
      {
        replacements: { message: INDETERMINATE_MESSAGE, minutes },
        type: QueryTypes.UPDATE,
      },
    );

    return ((rows ?? []) as unknown[]).length;
  }

  /**
   * Terminal write for a job.
   *
   * ALWAYS clears payload and context, on success and on failure alike. There
   * is no retry in this feature, so nothing reads either column again, and a
   * finished row that kept its payload would hold the operator's whole route
   * set — employee names, home points, addresses — for the full seven days the
   * prune allows.
   */
  async finish(
    id: bigint,
    status: TripSaveJobStatus,
    error?: string | null,
    resultMessage?: string | null,
  ): Promise<void> {
    await this.jobModel.update(
      {
        status,
        error: error ? String(error).slice(0, 250) : null,
        resultMessage: resultMessage
          ? String(resultMessage).slice(0, 250)
          : null,
        finishedAt: new Date(),
        payload: null,
        context: null,
      } as any,
      { where: { id } },
    );
  }

  /**
   * Prune finished rows, and abandoned ones that never finished at all.
   *
   * The second clause is what keeps the table bounded: a row whose process died
   * between claim and finish has finishedAt NULL forever, and a finishedAt-only
   * predicate would leave it in place permanently.
   */
  async prune(days: number): Promise<number> {
    const before = moment().subtract(days, 'days').toDate();

    return this.jobModel.destroy({
      where: {
        [Op.or]: [
          { finishedAt: { [Op.lt]: before } },
          { finishedAt: null, createdAt: { [Op.lt]: before } },
        ],
      },
    });
  }

  /**
   * TripSaveJobs.orgID is NOT NULL, and it is also the tenancy boundary the
   * status poll filters on.
   *
   * Reachable: PermissionGuard short-circuits to true for SuperAdmin
   * (roles-guard.ts:24-26), and an unswitched SuperAdmin's session carries
   * orgID null. The sync routes tolerate that today — create() writes
   * orgID: user?.orgID straight onto the Trip rows (trip.service.ts:344) —
   * but here it would surface as a not-null violation or, on the status read,
   * Sequelize's "WHERE parameter has invalid undefined value". Both are opaque
   * 500s. The Routing page is org-scoped, so say so.
   */
  private assertOrgSelected(orgID: any): void {
    if (orgID === undefined || orgID === null || orgID === '') {
      throw new BadRequestException(
        'No organization is selected. Switch into an organization before saving.',
      );
    }
  }

  private assertPayloadWithinLimit(payload: any): void {
    const bytes = Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8');

    if (bytes > MAX_PAYLOAD_BYTES) {
      const actualMB = (bytes / (1024 * 1024)).toFixed(1);
      const limitMB = (MAX_PAYLOAD_BYTES / (1024 * 1024)).toFixed(0);
      throw new BadRequestException(
        `This save is ${actualMB} MB, over the ${limitMB} MB limit for a ` +
          `background save. Route this shift in smaller batches and save each one.`,
      );
    }
  }
}
