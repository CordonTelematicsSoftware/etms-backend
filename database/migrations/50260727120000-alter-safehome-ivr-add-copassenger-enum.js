'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_SafeHomeIVRHistories_callType" ADD VALUE IF NOT EXISTS 'EMPLOYEE_TO_COPASSENGER';
    `);
  },

  async down(queryInterface) {
    // Postgres has no DROP VALUE for enums. Reverting means recreating the type
    // with the prior label set and repointing the column. Rows written with the
    // removed value would violate the new type, so they are nulled first.
    await queryInterface.sequelize.query(`
      UPDATE "SafeHomeIVRHistories"
      SET "callType" = NULL
      WHERE "callType" = 'EMPLOYEE_TO_COPASSENGER';
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_SafeHomeIVRHistories_callType" RENAME TO "enum_SafeHomeIVRHistories_callType_old";
    `);

    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_SafeHomeIVRHistories_callType" AS ENUM (
        'SAFE_HOME',
        'EMPLOYEE_TO_DRIVER',
        'DRIVER_TO_EMPLOYEE',
        'EMPLOYEE_TO_HELPDESK',
        'DRIVER_TO_HELPDESK'
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