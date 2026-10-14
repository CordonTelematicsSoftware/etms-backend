'use strict';

/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate

module.exports = {
  async up(queryInterface, Sequelize) {
    // actualCostOverride mirrors actualCost, which is STRING in
    // 331-create-trip-actuals.js. Keeping the same type avoids two different
    // representations of the same money value on one row.
    await queryInterface.addColumn('TripActuals', 'actualCostOverride', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('TripActuals', 'isCostOverridden', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('TripActuals', 'isCostOverridden');
    await queryInterface.removeColumn('TripActuals', 'actualCostOverride');
  },
};
