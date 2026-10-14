'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
     try {
            await queryInterface.addColumn('Trips', 'driverCode', {
                 allowNull: true,
                type: Sequelize.STRING,
            });
            await queryInterface.addColumn('Trips', 'vehicleNumber', {
                 allowNull: true,
                type: Sequelize.STRING,
            });
        } catch (e) {
            console.log(e);
        }
  },

  async down (queryInterface, Sequelize) {
      await queryInterface.removeColumn('Trips', 'driverCode');
      await queryInterface.removeColumn('Trips', 'vehicleNumber');
  }
};
