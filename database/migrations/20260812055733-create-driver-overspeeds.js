'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('DriverOverspeeds', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      date: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      time: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      tripID: {
        allowNull: false,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Trips',
          },
          key: 'id',
        },
        onUpdate: 'CASCADE',
      },
      orgID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Organizations',
          },
          key: 'id',
        },
      },
      driverID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Drivers',
          },
          key: 'id',
        },
      },
      driverCode: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      routeNumber: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      vendorCode: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      cabRegNo: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      pickDrop: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      lockStatus: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      estimatedDistance: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      estimatedOccupancy: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      employeeBoardedCount: {
        allowNull: true,
        type: Sequelize.INTEGER,
      },
      location: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      currentSpeed: {
        allowNull: false,
        type: Sequelize.FLOAT,
      },
      speedLimit: {
        allowNull: true,
        type: Sequelize.FLOAT,
      },
      shiftTime: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      empCodes: {
        allowNull: true,
        type: Sequelize.JSONB,
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
    await queryInterface.addIndex('DriverOverspeeds', ['tripID']);
    await queryInterface.addIndex('DriverOverspeeds', ['orgID']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('DriverOverspeeds');
  },
};