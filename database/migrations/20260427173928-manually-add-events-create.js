'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Directly add Event-Create to roles that have EventLog-Create
    await queryInterface.sequelize.query(`
      UPDATE "Roles"
      SET permissions = CASE 
        WHEN 'Event-Create' = ANY(permissions) THEN permissions
        ELSE array_append(permissions, 'Event-Create')
      END
      WHERE 'EventLog-Create' = ANY(permissions);
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove Event-Create from all roles
    await queryInterface.sequelize.query(`
      UPDATE "Roles"
      SET permissions = array_remove(permissions, 'Event-Create')
      WHERE 'Event-Create' = ANY(permissions);
    `);
  },
};