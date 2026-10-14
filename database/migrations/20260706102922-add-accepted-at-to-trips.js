'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Trips', 'acceptedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, queryInterface_Sequelize) {
    await queryInterface.removeColumn('Trips', 'acceptedAt');
  },
};