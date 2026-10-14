'use strict';

/**
 * updateIVRCallStatus resolves the history row for every Smartflo hangup with
 *   SELECT ... FROM "SafeHomeIVRHistories" WHERE "refID" = :ref_id
 * and that webhook is registered against ALL DIDs, so it fires for all five call
 * types on every call the account places. Safe-home rows now carry a refID too,
 * so the lookup runs on more rows than before and the table only grows.
 *
 * The existing index is ("callType", "tripRequestID") and does not serve this at
 * all — refID is not a prefix of it. Postgres creates no index for the plain
 * column either (there is no FK here).
 *
 * Partial on deletedAt because the model is paranoid: true and every caller
 * scopes to live rows.
 *
 * Filename sorts after 400-create-safehome-ivr-histories.js (table) and
 * 40250687999999-alter-table-safehome-ivr.js (which adds the refID column) so it
 * is also correct on a fresh db:migrate, not just on environments where those
 * already ran. A 2026* prefix would sort BEFORE both and fail on a fresh db.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "safehome_ivr_histories_refid_active"
           ON "SafeHomeIVRHistories" ("refID")
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
      `DROP INDEX IF EXISTS "safehome_ivr_histories_refid_active";`,
    );
  },
};
