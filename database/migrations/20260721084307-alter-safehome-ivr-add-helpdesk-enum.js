'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Postgres (12+) supports adding enum values directly.
    // Each ADD VALUE must run in its own statement (cannot be combined
    // in one ALTER TYPE, and cannot run inside certain transaction modes
    // with other DDL against the same type in older PG versions).
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_SafeHomeIVRHistories_callType" ADD VALUE IF NOT EXISTS 'EMPLOYEE_TO_HELPDESK';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_SafeHomeIVRHistories_callType" ADD VALUE IF NOT EXISTS 'DRIVER_TO_HELPDESK';
    `);
  },

  async down(queryInterface) {
    // Postgres has no DROP VALUE for enums, so reverting means recreating
    // the type with only the original 3 values and repointing the column.
    // Any existing rows using the removed values would violate the new
    // type, so we defensively null them out first.
    await queryInterface.sequelize.query(`
      UPDATE "SafeHomeIVRHistories"
      SET "callType" = NULL
      WHERE "callType" IN ('EMPLOYEE_TO_HELPDESK', 'DRIVER_TO_HELPDESK');
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_SafeHomeIVRHistories_callType" RENAME TO "enum_SafeHomeIVRHistories_callType_old";
    `);

    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_SafeHomeIVRHistories_callType" AS ENUM (
        'SAFE_HOME',
        'EMPLOYEE_TO_DRIVER',
        'DRIVER_TO_EMPLOYEE'
      );
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "SafeHomeIVRHistories"
      ALTER COLUMN "callType" TYPE "enum_SafeHomeIVRHistories_callType"
      USING "callType"::text::"enum_SafeHomeIVRHistories_callType";
    `);

    await queryInterface.sequelize.query(`
      DROP TYPE "enum_SafeHomeIVRHistories_callType_old";
    `);
  },
};