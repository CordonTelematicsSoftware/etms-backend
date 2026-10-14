'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Create the partitioned parent table
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS "EventLogs" (
        id SERIAL,
        objectType VARCHAR(255),
        objectID BIGINT,
        changeType VARCHAR(255),
        description TEXT,
        updatedBy VARCHAR(255),
        authID INTEGER,
        employeeID INTEGER,
        createdAt TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP,
        PRIMARY KEY (id, createdAt)
      )
      PARTITION BY RANGE (createdAt);  -- Define the partitioning column
    `);

    // // Step 2: Create the partitions for the months (e.g., November and December 2024)
    // await queryInterface.sequelize.query(`
    //   CREATE TABLE IF NOT EXISTS "EventLog_nov_2024"
    //   PARTITION OF "EventLog"
    //   FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
    // `);

    // await queryInterface.sequelize.query(`
    //   CREATE TABLE IF NOT EXISTS "EventLog_dec_2024"
    //   PARTITION OF "EventLog"
    //   FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');
    // `);

    // Step 3: Add Foreign Key constraints
    // Foreign key constraint for authID referencing Authentication table
    await queryInterface.addConstraint('EventLogs', {
      type: 'foreign key',
      fields: ['authID'],
      references: {
        table: 'Authentications',
        field: 'id', // Assuming 'id' is the primary key of Authentication table
      },
      onUpdate: 'CASCADE', // On update, propagate changes
      onDelete: 'SET NULL', // If the referenced Authentication record is deleted, set authID to NULL
    });

    // Foreign key constraint for employeeID referencing Employee table
    await queryInterface.addConstraint('EventLogs', {
      type: 'foreign key',
      fields: ['employeeID'],
      references: {
        table: 'Employees',
        field: 'id', // Assuming 'id' is the primary key of Employee table
      },
      onUpdate: 'CASCADE', // On update, propagate changes
      onDelete: 'SET NULL', // If the referenced Employee record is deleted, set employeeID to NULL
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Drop foreign key constraints first
    await queryInterface.removeConstraint('EventLogs', 'EventLog_authID_fkey');
    await queryInterface.removeConstraint(
      'EventLogs',
      'EventLog_employeeID_fkey',
    );

    // Drop the partitions first
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS "EventLogs_dec_2024";
    `);

    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS "EventLogs_nov_2024";
    `);

    // Drop the partitioned parent table
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS "EventLog";
    `);
  },
};
