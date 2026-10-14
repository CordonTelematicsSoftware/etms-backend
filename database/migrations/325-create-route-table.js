'use strict';
/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Routes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      name: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      zoneIDs: {
        type: Sequelize.ARRAY(Sequelize.INTEGER), // Array of numbers
        allowNull: true, // Or false if required
      },
      orgID: {
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Organizations',
          },
          key: 'id',
        },
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      deletedAt: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('Routes');
  },
};
