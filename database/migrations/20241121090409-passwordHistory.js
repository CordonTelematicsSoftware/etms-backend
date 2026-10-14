'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PasswordHistories', {
      id: {
        primaryKey: true,
        autoIncrement: true,
        type: Sequelize.BIGINT,
      },
      employeeID: {
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Employees',
          },
          key: 'id',
        },
      },
      createdDate: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      hashedPassword: {
        type: Sequelize.STRING,
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
    await queryInterface.dropTable('PasswordHistories');
  },
};
