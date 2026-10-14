'use strict';
/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('SafeHomeIVRHistories', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      employeeID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'Employees',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      employeePhone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      tripRequestID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'TripRequests',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      callUUID: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      callID: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      callStatus: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('SafeHomeIVRHistories');
  },
};
