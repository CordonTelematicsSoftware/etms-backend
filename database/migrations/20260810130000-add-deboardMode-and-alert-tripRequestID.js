'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('TripRequests', 'deboardMode', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Alerts', 'tripRequestID', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('TripRequests', 'deboardMode');
    await queryInterface.removeColumn('Alerts', 'tripRequestID');
  },
};