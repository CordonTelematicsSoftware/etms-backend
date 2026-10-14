'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    try {
             await queryInterface.addColumn('Teams', 'isTeamConfigEnabled', {
              type: Sequelize.BOOLEAN,
              defaultValue: false,
            });
            await queryInterface.addColumn('Teams', 'teamConfig', {
              type: Sequelize.JSONB,
            });
        } catch (e) {
            console.log(e);
        }
    },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Teams', 'isTeamConfigEnabled');
    await queryInterface.removeColumn('Teams', 'teamConfig');
  }
};
