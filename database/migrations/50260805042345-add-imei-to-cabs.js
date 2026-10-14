'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Cabs', 'imei', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addIndex('Cabs', ['imei'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Cabs', ['imei']);
    await queryInterface.removeColumn('Cabs', 'imei');
  },
};
