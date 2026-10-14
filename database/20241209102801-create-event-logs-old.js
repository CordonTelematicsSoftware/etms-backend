'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('EventLogs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      objectType: {
        type: Sequelize.STRING,
      },
      changeType: {
        type: Sequelize.STRING,
      },
      description: {
        type: Sequelize.STRING,
      },
      description: {
        type: Sequelize.STRING,
      },
      description: {
        type: Sequelize.STRING,
      },
      description: {
        type: Sequelize.STRING,
      },
      updatedBy: {
        type: Sequelize.STRING,
      },
      changeJSON: {
        type: Sequelize.JSONB,
      },
      payloadJSON: {
        type: Sequelize.JSONB,
      },
      authID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Authentications',
          },
          key: 'id',
        },
      },
      employeeID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Employees',
          },
          key: 'id',
        },
      },
      objectID: {
        type: Sequelize.BIGINT,
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
    await queryInterface.dropTable('EventLogs');
  },
};
