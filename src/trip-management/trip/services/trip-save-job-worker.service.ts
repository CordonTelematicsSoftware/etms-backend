import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { TripService } from './trip.service';
import {
  INDETERMINATE_MESSAGE,
  TripSaveJobService,
} from './trip-save-job.service';
import { TripSaveJob } from '../models/trip-save-job.model';

/**
 * Gate. Read INSIDE the handler, never at module-definition time: ConfigModule
 * has not populated process.env when providers are constructed
 * (schedule-reminder-generator-cron.service.ts:40-41).
 *
 * Checking it per tick rather than once at startup also means the worker has no
 * "never started" state to get stuck in — flipping the flag takes effect on the
 * next tick with no restart.
 */
const WORKER_FLAG = 'TRIP_SAVE_JOB_WORKER_ENABLED';

const POLL_INTERVAL_MS = 1000;

/** Finished and abandoned rows are deleted after this many days. */
const PRUNE_AFTER_DAYS = 7;

/**
 * How long an unclaimed 'pending' row may sit before it is failed.
 *
 * Only ever applied while NOTHING is running — see
 * TripSaveJobService.failStalePending — so this is not a cap on queue wait. It
 * is the window for "no process is going to pick this up at all", and ten
 * minutes is twenty times the 30-second poll the page uses, long enough that a
 * worker restart cannot trip it.
 */
const PENDING_TIMEOUT_MINUTES = 10;

/**
 * Sweep at most this often per process.
 *
 * The tick is 1 s. Against a 10-minute threshold, running the sweep UPDATE every
 * second on every cluster worker is pure noise for no earlier detection.
 */
const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * ONE. This is the load-bearing constraint of the whole feature.
 *
 * TripService.update() creates any trip in its payload that has no id, and
 * updates the ones that do (trip.service.ts:495-499 splits them). Replaying a
 * crashed update would be harmless for the updates — same values written twice
 * — but every id-less trip would be created a SECOND time, producing duplicate
 * routeNumbers for the shift. The Routing page's own dedup guard
 * (trip.service.ts:192-205) then finds trips already present for that
 * date/shift/leg and refuses every subsequent save, so the shift becomes
 * permanently unsavable and has to be repaired by hand in the DB.
 *
 * A crashed job is therefore failed, never retried. The cap is enforced by the
 * claim UPDATE incrementing attempts: a fresh row arrives here holding 1, and
 * anything holding 2 is a row whose first run died.
 */
const MAX_ATTEMPTS = 1;

/**
 * Runs Routing-page saves off the request path.
 *
 * Shape is lifted from SqsNotificationWorkerService (:25-78) — OnModuleInit,
 * self-rescheduling setTimeout, unref'd timer — with two deliberate departures
 * from it, both marked below: a top-level try/catch, and no permanent stop.
 */
@Injectable()
export class TripSaveJobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripSaveJobWorkerService.name);
  private stopped = true;
  private timer?: NodeJS.Timeout;
  private lastSweepAt = 0;

  constructor(
    private readonly jobService: TripSaveJobService,
    private readonly tripService: TripService,
  ) {}

  onModuleInit(): void {
    this.stopped = false;
    this.schedule(0);
  }

  onModuleDestroy(): void {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private schedule(delay: number): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        await this.runOnce();
      } catch (error) {
        // TOP-LEVEL CONTAINMENT. Not defensive style — load-bearing.
        //
        // There is no unhandledRejection or uncaughtException handler anywhere
        // in this app (none in main.ts, none in app.module.ts), and Node 20
        // defaults to --unhandled-rejections=throw with no node_args in
        // app.json to override it. TripService.create() throws
        // BadRequestException on its dedup guard (trip.service.ts:213) and on
        // any internal failure (:463); update() re-throws (:869-875). Outside a
        // request those never reach GlobalExceptionsFilter, which is a
        // request-pipeline filter and reaches for host.switchToHttp()
        // immediately (global-exception-handler.ts:24-26).
        //
        // So an escaped throw here would kill the PM2 process, taking the HTTP
        // server and every other in-flight save with it. Same wrapping, same
        // reason, as schedule-reminder-cron.service.ts:117-126.
        this.logger.error(
          `Trip save job tick failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      } finally {
        // NO LATCH. SqsNotificationWorkerService sets stopped = true on a
        // credentials error (:59) and nothing ever re-arms it, so one failure
        // ends polling for the life of the process. stopped here is set only
        // by onModuleDestroy: on error we log, the job is marked failed, and
        // the loop keeps ticking.
        this.schedule(POLL_INTERVAL_MS);
      }
    }, delay);

    // Shutdown hooks are not enabled in this app (main.ts never calls
    // enableShutdownHooks), so onModuleDestroy does not run on SIGTERM. unref
    // is what keeps this timer from holding the event loop open anyway.
    this.timer.unref?.();
  }

  /**
   * One job per tick — N = 1, deliberately.
   *
   * A single in-flight save already peaks around five pool acquisitions against
   * pool.max: 10 (app.module.ts:91-97). Two concurrent jobs would starve every
   * other request served by this process, including the status polls this
   * feature depends on.
   */
  private async runOnce(): Promise<void> {
    if (process.env[WORKER_FLAG] !== 'true') {
      return;
    }

    await this.sweepStalePending();

    const candidate = await this.jobService.findNextClaimable();
    if (!candidate) {
      return;
    }

    const { claimed, attempts } = await this.jobService.claim(candidate.id);
    if (!claimed) {
      // Another process won the row. Not an error.
      return;
    }

    if (attempts > MAX_ATTEMPTS) {
      // A row we just took over from a run that died mid-flight. See
      // MAX_ATTEMPTS: this must never execute a second time.
      await this.jobService.finish(
        candidate.id,
        'failed',
        INDETERMINATE_MESSAGE,
        null,
      );
      this.logger.warn(
        `Trip save job ${candidate.id} [${candidate.kind}] FAILED as stale on ` +
          `attempt ${attempts} — a previous run claimed it and never finished. ` +
          `Not retried by design.`,
      );
      return;
    }

    const job = await this.jobService.findForExecution(candidate.id);
    if (!job) {
      // Pruned between the claim and this read. Nothing left to do.
      return;
    }

    const startedAt = Date.now();
    let result: { message?: string };

    try {
      result = await this.execute(job);
    } catch (error: any) {
      // INDETERMINATE_MESSAGE, never the raw error, for two reasons.
      //
      // Correctness: update() commits inside its own transaction and creates
      // any trip in the payload lacking an id (trip.service.ts:740). A failure
      // partway through leaves work committed, so "it failed, try again" would
      // invite exactly the replay that produces duplicate routeNumbers.
      //
      // Disclosure: this column is returned by GET save-job/:id to any
      // Trip-Read user, and a raw Sequelize error carries table, column and
      // constraint names. The real cause goes to the log instead.
      await this.jobService.finish(
        job.id,
        'failed',
        INDETERMINATE_MESSAGE,
        null,
      );
      this.logger.error(
        `Trip save job ${job.id} [${job.kind}] org ${job.orgID} FAILED after ` +
          `${Date.now() - startedAt}ms: ${error?.message ?? error}`,
        error?.stack,
      );
      return;
    }

    // DELIBERATELY OUTSIDE the try above. The trips are committed by this
    // point, so a write failure here must not be rewritten as an execution
    // failure — that would report a successful save as failed and send the
    // operator back to re-save it. Letting this throw is the safe outcome: the
    // tick handler logs it, the row stays 'running', and the stale path marks
    // it failed with INDETERMINATE_MESSAGE, which is the honest description of
    // a save that did in fact complete.
    await this.jobService.finish(job.id, 'done', null, result?.message ?? null);
    this.logger.log(
      `Trip save job ${job.id} [${job.kind}] org ${job.orgID} DONE in ` +
        `${Date.now() - startedAt}ms — ${result?.message ?? 'no message'}`,
    );
  }

  /**
   * Age out pending rows nothing is ever going to claim.
   *
   * Inside the WORKER_FLAG gate, so this is NOT a fix for "the flag is off on
   * every process" — those rows still sit until the 7-day prune, unchanged. The
   * flag stays a real kill switch: a disabled worker writes nothing. What this
   * covers is a process that died between the insert and the claim, and a worker
   * that was down or restarting while saves were queued.
   *
   * No try/catch: this is already inside schedule()'s containment (:86-119). A
   * throw costs one tick's job execution and the next tick proceeds, with the
   * sweep skipped for the rest of the interval because lastSweepAt is already
   * stamped.
   */
  private async sweepStalePending(): Promise<void> {
    if (Date.now() - this.lastSweepAt < SWEEP_INTERVAL_MS) {
      return;
    }
    this.lastSweepAt = Date.now();

    const failed = await this.jobService.failStalePending(
      PENDING_TIMEOUT_MINUTES,
    );

    if (failed > 0) {
      this.logger.warn(
        `Trip save job sweep: FAILED ${failed} pending job(s) unclaimed for ` +
          `over ${PENDING_TIMEOUT_MINUTES} minutes with no job running. ` +
          `A worker was down or a process died before claiming.`,
      );
    }
  }

  /** Calls TripService exactly as the sync routes do. Nothing is adapted. */
  private async execute(job: TripSaveJob): Promise<{ message?: string }> {
    const context = job.context ?? {};
    const user = context.user;

    if (!user) {
      throw new Error('Job context is missing the user snapshot.');
    }

    // strictNullChecks is off, and create() would treat a null payload as an
    // empty set and report success for zero trips. Fail loudly instead.
    if (!job.payload) {
      throw new Error('Job payload is empty.');
    }

    if (job.kind === 'create') {
      return this.tripService.create(job.payload, user);
    }

    if (job.kind === 'update') {
      return this.tripService.update(
        job.payload,
        user,
        context.shiftTime,
        context.date,
      );
    }

    throw new Error(`Unknown trip save job kind '${job.kind}'.`);
  }

  /**
   * Nightly prune. Same flag as the worker, same per-tick read of it.
   *
   * The try/catch is not optional here either: an unhandled rejection out of a
   * cron handler takes the process down (see schedule() above), and cron does
   * not await the handler it calls.
   */
  @Cron('30 2 * * *')
  async handlePrune(): Promise<void> {
    if (process.env[WORKER_FLAG] !== 'true') {
      return;
    }

    try {
      const deleted = await this.jobService.prune(PRUNE_AFTER_DAYS);
      this.logger.log(
        `Trip save job prune: deleted=${deleted} (older than ${PRUNE_AFTER_DAYS} days)`,
      );
    } catch (error: any) {
      this.logger.error(
        `Trip save job prune FAILED: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }
}
