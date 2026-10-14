'use strict';

/**
 * One-time data fix for the "EventLogs_sept_2026" table-naming bug.
 *
 * Root cause (fixed separately in application code — see
 * eventlogDynamicModel.ts's getTableName()): the event-log write path
 * derived the month segment of the dynamic table name via
 * `Date.toLocaleString('default', { month: 'short' })`, which returns
 * "Sept" (4 letters) for September under Node's ICU data. Every read
 * path (getLogsByDateRange, exportEventLogs, getModulesByDateRange,
 * etc.) derives the same segment via dayjs's 'MMM' token, which returns
 * "Sep" (3 letters) — the standard abbreviation, and what every other
 * month already agrees on both ways. The mismatch meant every event
 * logged during the affected period landed in "EventLogs_sept_2026"
 * while every read looked for "EventLogs_sep_2026", found no such table,
 * and silently returned an empty result.
 *
 * This migration renames the mis-named table — and its implicitly
 * created id sequence, which Postgres does not rename automatically
 * alongside a table — back onto the name the rest of the application
 * already expects, so the rows that already exist become reachable
 * again. It does not create anything and does not touch any other
 * table.
 *
 * Guarded with to_regclass() existence checks so this is safe to run
 * against any environment: a database that never hit the bug (no
 * "EventLogs_sept_2026" table at all) is left untouched, and a database
 * where "EventLogs_sep_2026" already exists for some other reason is
 * also left untouched rather than risking a destructive overwrite.
 *
 * NOTE: this only recovers already-written rows. It does not prevent
 * the bug from recurring — that fix lives in application code
 * (eventlogDynamicModel.ts's getTableName(), switched to dayjs) and
 * must ship independently of this migration.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1) Rename the table, only if the mis-named one exists and the
      //    correctly-named one does not already exist.
      await queryInterface.sequelize.query(
        `
        DO $$
        BEGIN
          IF to_regclass('public."EventLogs_sept_2026"') IS NOT NULL
             AND to_regclass('public."EventLogs_sep_2026"') IS NULL THEN
            ALTER TABLE "EventLogs_sept_2026" RENAME TO "EventLogs_sep_2026";
          END IF;
        END $$;
        `,
        { transaction },
      );

      // 2) Rename the table's implicit id sequence to match. Postgres
      //    auto-names an identity/serial column's backing sequence as
      //    "<table>_<column>_seq" at creation time and does NOT rename
      //    it when the table itself is renamed later, so this has to be
      //    done as an explicit second step.
      await queryInterface.sequelize.query(
        `
        DO $$
        BEGIN
          IF to_regclass('public."EventLogs_sept_2026_id_seq"') IS NOT NULL
             AND to_regclass('public."EventLogs_sep_2026_id_seq"') IS NULL THEN
            ALTER SEQUENCE "EventLogs_sept_2026_id_seq" RENAME TO "EventLogs_sep_2026_id_seq";
          END IF;
        END $$;
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Reverses the rename, guarded the same way, so this migration is
      // cleanly invertible. Rolling back does NOT restore the original
      // bug in application code — it only un-does this table rename.
      await queryInterface.sequelize.query(
        `
        DO $$
        BEGIN
          IF to_regclass('public."EventLogs_sep_2026"') IS NOT NULL
             AND to_regclass('public."EventLogs_sept_2026"') IS NULL THEN
            ALTER TABLE "EventLogs_sep_2026" RENAME TO "EventLogs_sept_2026";
          END IF;
        END $$;
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DO $$
        BEGIN
          IF to_regclass('public."EventLogs_sep_2026_id_seq"') IS NOT NULL
             AND to_regclass('public."EventLogs_sept_2026_id_seq"') IS NULL THEN
            ALTER SEQUENCE "EventLogs_sep_2026_id_seq" RENAME TO "EventLogs_sept_2026_id_seq";
          END IF;
        END $$;
        `,
        { transaction },
      );
    });
  },
};