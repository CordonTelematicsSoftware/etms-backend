'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface) {
    // Postgres requires ADD VALUE to commit before the new value can be
    // used elsewhere, so this migration does nothing else in the same file.
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_notification_provider" ADD VALUE IF NOT EXISTS 'push_firebase_driver';
    `);
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. Removing a single enum
    // value safely requires recreating the whole type — rename old, create
    // new without the value, migrate every column onto it, drop old — which
    // isn't safe to do blindly here. Intentional no-op: leaving the unused
    // value in place is harmless.
  },
};