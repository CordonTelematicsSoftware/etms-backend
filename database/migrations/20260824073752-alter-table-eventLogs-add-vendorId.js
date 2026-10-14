'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // EventLogs tables are per-month (`EventLogs_<mon>_<year>`), so there's
    // no fixed table name to hardcode here - discover them at migration
    // time instead.
    //
    // Deliberately not a raw `SELECT table_name FROM information_schema.tables`
    // query: that exact literal string gets intercepted by Sequelize's own
    // postgres dialect (isTableNameQuery, used internally by
    // showAllTables()/tableExistsQuery()) and reshapes the result, breaking
    // callers expecting normal [rows, metadata] output. showAllTables() is
    // Sequelize's own public API for this and doesn't collide with itself -
    // see the same note in eventlog.service.ts (getObjectHistory).
    const allTables = await queryInterface.showAllTables();
    const eventLogTables = allTables.filter((name) =>
      name.startsWith('EventLogs_'),
    );

    for (const tableName of eventLogTables) {
      const columns = await queryInterface.describeTable(tableName);
      if (columns.vendorID) {
        continue; // already has it - keeps this migration safe to re-run
      }
      await queryInterface.addColumn(tableName, 'vendorID', {
        type: Sequelize.BIGINT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const allTables = await queryInterface.showAllTables();
    const eventLogTables = allTables.filter((name) =>
      name.startsWith('EventLogs_'),
    );

    for (const tableName of eventLogTables) {
      const columns = await queryInterface.describeTable(tableName);
      if (!columns.vendorID) {
        continue;
      }
      await queryInterface.removeColumn(tableName, 'vendorID');
    }
  },
};