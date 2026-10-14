'use strict';

/**
 * The safe-home report's inclusion predicate runs
 *   SELECT "tripRequestID" FROM "SafeHomeIVRHistories"
 *    WHERE "callType" = 'SAFE_HOME' AND "tripRequestID" IS NOT NULL
 *      AND "deletedAt" IS NULL
 * as a subquery on every page load and every export, and the table had no index
 * at all — the FK on tripRequestID does not create one in Postgres.
 *
 * callType leads because it is the only equality predicate; tripRequestID second
 * makes the scan index-only and also covers the report's follow-up
 * `callType = 'SAFE_HOME' AND tripRequestID IN (...)` fetch on the same request.
 * Partial on deletedAt because the model is paranoid: true and every caller
 * scopes to live rows.
 *
 * Does NOT serve hasTwoMissedCallsForTripRequest (tripRequestID + callStatus) —
 * that one wants tripRequestID leading and is a single-row lookup, not the scan
 * this fixes.
 *
 * Filename sorts after 400-create-safehome-ivr-histories.js (table) and
 * 40250687999999-alter-table-safehome-ivr.js (callType column) so it is also
 * correct on a fresh db:migrate, not just on environments where those already ran.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "safehome_ivr_histories_calltype_triprequestid_active"
           ON "SafeHomeIVRHistories" ("callType", "tripRequestID")
           WHERE "deletedAt" IS NULL;`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "safehome_ivr_histories_calltype_triprequestid_active";`,
    );
  },
};
