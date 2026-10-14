'use strict';

/**
 * Idempotency ledger for the schedule-cutoff reminder.
 *
 * The reminder cron has no distributed lock available (no redis/bull/advisory
 * locks exist in this codebase), and app.json runs PM2 with exec_mode "cluster"
 * — today instances:1 is the only thing preventing a double-fire, and lambda.ts
 * imports the same AppModule so a warm container can run the schedule too.
 *
 * The UNIQUE constraint on (employeeID, cutoffPeriodKey) is the durable second
 * layer: a re-fire for the same employee and the same booking period is a
 * constraint violation, not a duplicate notification. The service inserts the
 * ledger row per employee and treats a unique violation as "already reminded".
 *
 * cutoffPeriodKey identifies the BOOKING PERIOD the reminder covered, not the
 * time the cron ran — e.g. "daily:2026-08-18", "weekly:2026-W35",
 * "monthly:2026-09". Two runs on the same day for the same period collide;
 * a genuinely new period does not.
 *
 * NOT paranoid: a soft-deleted ledger row would still occupy the unique slot,
 * so deletedAt would add no capability while making the constraint confusing.
 * Rows are append-only.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'ScheduleReminderLogs',
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.BIGINT,
          },
          employeeID: {
            allowNull: false,
            type: Sequelize.BIGINT,
            references: {
              model: 'Employees',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          orgID: {
            allowNull: false,
            type: Sequelize.BIGINT,
            references: {
              model: 'Organizations',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          // The booking period this reminder covered. See header.
          cutoffPeriodKey: {
            allowNull: false,
            type: Sequelize.STRING,
          },
          // daily | weekly | monthly. hourly is not reminded on in v1.
          mode: {
            allowNull: false,
            type: Sequelize.STRING,
          },
          // pick | drop — the leg whose cutoff triggered this reminder.
          leg: {
            allowNull: true,
            type: Sequelize.STRING,
          },
          // The cutoff instant this reminder was fired ahead of.
          cutoffAt: {
            allowNull: true,
            type: Sequelize.DATE,
          },
          sentAt: {
            allowNull: true,
            type: Sequelize.DATE,
          },
          // NotificationLog id returned by the dispatcher, for tracing a
          // reminder to its delivery attempt. Not an FK: the dispatcher can
          // return zero log ids when an org has no enabled channel config.
          notificationLogId: {
            allowNull: true,
            type: Sequelize.STRING,
          },
          createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
          updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
        },
        { transaction },
      );

      // The idempotency guarantee itself.
      await queryInterface.addIndex(
        'ScheduleReminderLogs',
        ['employeeID', 'cutoffPeriodKey'],
        {
          unique: true,
          name: 'schedule_reminder_logs_employee_period_unique',
          transaction,
        },
      );

      // Sweep-time lookup: "which of these employees already got this period?"
      await queryInterface.addIndex(
        'ScheduleReminderLogs',
        ['orgID', 'cutoffPeriodKey'],
        {
          name: 'schedule_reminder_logs_org_period',
          transaction,
        },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ScheduleReminderLogs');
  },
};
