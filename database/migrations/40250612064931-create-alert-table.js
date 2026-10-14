'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Alerts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      source: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      location: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'alert',
      },
      tripID: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'Trips',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      orgID: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'Organizations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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
      driverID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'Drivers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      status: {
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
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Add indexes for better performance
    await queryInterface.addIndex('Alerts', ['tripID']);
    await queryInterface.addIndex('Alerts', ['employeeID']);
    await queryInterface.addIndex('Alerts', ['driverID']);
    await queryInterface.addIndex('Alerts', ['source']);
    await queryInterface.addIndex('Alerts', ['type']);
    await queryInterface.addIndex('Alerts', ['orgID', 'createdAt']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Alerts');
  },
};
