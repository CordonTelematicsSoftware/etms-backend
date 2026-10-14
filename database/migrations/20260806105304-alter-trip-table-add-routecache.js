'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Trips', 'routeCache', {
      allowNull: true,
      type: Sequelize.JSONB,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Trips', 'routeCache');
  },
};