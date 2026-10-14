'use strict';

/**
 * Attempt counter for the hourly reminder poller.
 *
 * The poller resets a failed row to 'pending' and leaves "runAt" untouched. Its
 * batch is ORDER BY "runAt" ASC LIMIT 50, so a row that keeps throwing has the
 * OLDEST runAt, sorts first, and is re-selected on every 15-minute tick
 * forever — starving every other due row behind it. Nothing counted attempts,
 * so there was no way to stop it or to see it happening.
 *
 * With this column the poller writes 'skipped' once attempts reaches its cap,
 * and the due-row query excludes exhausted rows outright.
 *
 * NOT NULL DEFAULT 0 so existing rows are backfilled to 0 by the ALTER itself
 * and immediately participate in the new predicate.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ScheduleReminderSchedules', 'attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('ScheduleReminderSchedules', 'attempts');
  },
};
