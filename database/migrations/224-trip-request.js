'use strict';
/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TripRequests', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
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
        allowNull: true,
        type: Sequelize.STRING,
      },
      teamID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Teams',
          },
          key: 'id',
        },
      },
      processID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Processes',
          },
          key: 'id',
        },
      },
      date: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      shiftTime: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      pickDrop: {
        allowNull: true,
        type: Sequelize.BOOLEAN,
      },
      pickUpTime: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      dropTime: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      status: {
        type: Sequelize.STRING,
      },
      tripID: {
        allowNull: true,
        type: Sequelize.BIGINT,
      },
      locationID: {
        allowNull: true,
        type: Sequelize.BIGINT,
      },
      locationType: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      geoCode: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      locationName: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      attendanceMode: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      attendanceOtp: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      attendance: {
        allowNull: true,
        type: Sequelize.BOOLEAN,
      },
      attendanceLocation: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      attendanceTime: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      noShow: {
        allowNull: true,
        type: Sequelize.BOOLEAN,
      },
      emergencyType: { type: Sequelize.STRING, allowNull: true },
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
    await queryInterface.dropTable('TripRequests');
  },
};
