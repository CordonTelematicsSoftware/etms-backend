'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  up: async (queryInterface) => {
    // Reset the auto-increment value for the 'roles' table
    await queryInterface.sequelize.query(
      'ALTER SEQUENCE "Roles_id_seq" RESTART WITH 1;',
    );
    await queryInterface.sequelize.query(
      'ALTER SEQUENCE "Authentications_id_seq" RESTART WITH 1;',
    );
  },

  down: async () => {
    // No need to revert the change in this case
  },
};
