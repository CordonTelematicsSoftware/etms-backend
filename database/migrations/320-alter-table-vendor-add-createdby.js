'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Vendors', 'createdBy', {
      type: Sequelize.BIGINT,
      references: {
        model: {
          tableName: 'Authentications',
        },
        key: 'id',
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Vendors', 'createdBy');
  },
};
