'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SecurityAttendances', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      spockID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Securities',
          },
          key: 'id',
        },
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
      attendanceMarkedTime: {
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
