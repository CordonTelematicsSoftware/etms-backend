'use strict';

/**
 * "TripRequests" has no index at all beyond its primary key — the FKs on
 * employeeID/orgID/teamID/processID do not create one in Postgres, which indexes
 * only the referenced PK. The schedule-reminder sweep runs a correlated
 *
 *   NOT EXISTS (SELECT 1 FROM "TripRequests"
 *                WHERE "employeeID" = e.id
 *                  AND "date" >= :start AND "date" < :end
 *                  AND status IN (...) AND "deletedAt" IS NULL)
 *
 * once per active employee per org per run, which is a sequential scan of the
 * largest table in the schema without this index.
 *
 * employeeID leads because it is the equality/correlation key; date second
 * because it is the range predicate. status is deliberately NOT included: it is
 * mutated by ~40 tripRequestModel.update() sites, and indexing it would break
 * heap-only-tuple updates on every one of them, converting cheap in-page writes
 * into index churn plus bloat. It also sits after a range predicate here, so it
 * could never be used for seeking — only as a filter saving a heap fetch.
 * orgID is NOT included either: it does not appear in the correlated subquery at
 * all, so as a leading column it would make the index unusable for this lookup.
 *
 * Partial on deletedAt because the model is paranoid: true and every reader is
 * scoped to live rows, so Postgres can prove the implication.
 *
 * NOT UNIQUE, deliberately. A unique index is the one index shape that can turn
 * an INSERT that would otherwise succeed into a statement error, which would
 * change rollback behaviour for the ~1000-row bulkCreate paths
 * (trip-request.service.ts:3963 import, :5895 batch-new). A plain index adds no
 * new failure mode — index maintenance is transactional and rolls back with the
 * enclosing transaction.
 *
 * CONCURRENTLY so this does not take an ACCESS EXCLUSIVE lock on a hot
 * production table for the duration of the build.
 *
 * IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
 * This migration therefore does NOT open one — unlike the sibling index
 * migrations (50260811000000, 50260812000000) which wrap their non-concurrent
 * CREATE INDEX in an explicit transaction. sequelize-cli does not wrap
 * migrations in a transaction of its own, so omitting it here is sufficient.
 *
 * If your runner is ever changed to wrap migrations (umzug `wrap`, or a
 * --transaction flag), this migration will fail with
 *   "CREATE INDEX CONCURRENTLY cannot run inside a transaction block".
 * The dev/local fallback is the same statement without CONCURRENTLY:
 *   CREATE INDEX IF NOT EXISTS "trip_requests_employee_date_active"
 *     ON "TripRequests" ("employeeID", "date") WHERE "deletedAt" IS NULL;
 * which is safe on a small table but locks writes on a large one.
 *
 * Filename sorts after 224-trip-request.js (the table) and all
 * *-alter-trip-request.js migrations, so it is correct on a fresh db:migrate as
 * well as on environments where those already ran.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    // No transaction: see the CONCURRENTLY note above.
    await queryInterface.sequelize.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "trip_requests_employee_date_active"
         ON "TripRequests" ("employeeID", "date")
         WHERE "deletedAt" IS NULL;`,
    );
  },

  async down(queryInterface) {
    // DROP INDEX CONCURRENTLY also cannot run inside a transaction block.
    // Also clears the INVALID index left behind if a CONCURRENTLY build fails
    // partway — re-running `up` after a failure requires this first.
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "trip_requests_employee_date_active";`,
    );
  },
};
