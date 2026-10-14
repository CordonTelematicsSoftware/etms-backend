'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('EmployeeTripOtps', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      employeeID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Employees',
          },
          key: 'id',
        },
      },
      employeeCode: {
        type: Sequelize.STRING,
      },
      otp: {
        type: Sequelize.STRING,
      },
      generatedTime: {
        type: Sequelize.STRING,
      },
      expiryTime: {
        type: Sequelize.STRING,
      },
      tripID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Trips',
          },
          key: 'id',
        },
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
      status: {
        type: Sequelize.STRING
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
    await queryInterface.dropTable('SecurityAttendances');
  },
};
