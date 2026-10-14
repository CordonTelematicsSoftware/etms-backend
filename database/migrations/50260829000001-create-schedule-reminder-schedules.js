'use strict';

/**
 * Upcoming hourly-cutoff reminder instants, one row per
 * (org|team, leg, shift time, trip date).
 *
 * Generated 7 days forward and regenerated when an org admin changes shift
 * times or the hourly cutoffs. A poller claims due rows atomically:
 *
 *   UPDATE ... SET "status" = 'running' WHERE "id" = :id AND "status" = 'pending'
 *
 * There is no advisory lock or leader election anywhere in this codebase, and
 * exec_mode "cluster" plus warm Lambda containers means several processes hold
 * live cron timers. The conditional UPDATE is the only thing preventing a
 * double send, so the (status, runAt) index below is load-bearing.
 *
 * teamID NULL means an org-level row. Postgres treats NULLs as distinct in a
 * unique index, so the constraint is split into two partial indexes rather
 * than one five-column index — otherwise duplicate org-level rows would be
 * accepted silently.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ScheduleReminderSchedules', {
      id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      orgID: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'Organizations', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      teamID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'Teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // 'pick' | 'drop'
      leg: { type: Sequelize.STRING, allowNull: false },
      // 'HH:mm', as stored in Login time / Logout time / Teams.shiftLoginTime
      shiftTime: { type: Sequelize.STRING, allowNull: false },
      // 'YYYY-MM-DD', matching TripRequests."date" which is varchar, not a date
      tripDate: { type: Sequelize.STRING, allowNull: false },
      // shiftInstant - upperCutoff hours: the moment the booking window opens
      runAt: { type: Sequelize.DATE, allowNull: false },
      // 'pending' | 'running' | 'done' | 'skipped'
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'pending',
      },
      claimedAt: { type: Sequelize.DATE, allowNull: true },
      finishedAt: { type: Sequelize.DATE, allowNull: true },
      error: { type: Sequelize.STRING, allowNull: true },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // The poller's only query: WHERE status = 'pending' AND runAt <= now().
    await queryInterface.addIndex('ScheduleReminderSchedules', {
      name: 'schedule_reminder_schedules_status_run_at',
      fields: ['status', 'runAt'],
    });

    // Team-scoped rows: all five columns.
    await queryInterface.addIndex('ScheduleReminderSchedules', {
      name: 'schedule_reminder_schedules_team_unique',
      unique: true,
      fields: ['orgID', 'teamID', 'leg', 'shiftTime', 'tripDate'],
      where: { teamID: { [Sequelize.Op.ne]: null } },
    });

    // Org-level rows: teamID is NULL and therefore cannot participate.
    await queryInterface.addIndex('ScheduleReminderSchedules', {
      name: 'schedule_reminder_schedules_org_unique',
      unique: true,
      fields: ['orgID', 'leg', 'shiftTime', 'tripDate'],
      where: { teamID: null },
    });

    // Prune query: DELETE WHERE runAt < now() - interval.
    await queryInterface.addIndex('ScheduleReminderSchedules', {
      name: 'schedule_reminder_schedules_org_run_at',
      fields: ['orgID', 'runAt'],
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ScheduleReminderSchedules');
  },
};