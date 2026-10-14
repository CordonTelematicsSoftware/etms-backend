'use strict';
/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('DriverAuthentications', {
      id: {
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
        type: Sequelize.BIGINT,
      },
      email: {
        type: Sequelize.STRING,
      },
      phone: {
        type: Sequelize.STRING,
      },
      name: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      hashedPassword: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      passwordCreatedAt: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      hashedOtp: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      passwordResetToken: {
        type: Sequelize.STRING,
      },
      otpCreatedAt: {
        allowNull: true,
        type: Sequelize.DATE,
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
      vendorUserID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'VendorUsers',
          },
          key: 'id',
        },
      },
      vendorID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Vendors',
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
      userType: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      failedLoginAttempts: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      otpResendAttempts: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      reActivationTime: {
        allowNull: true,
        type: Sequelize.DATE,
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
      lastLogin: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      deletedAt: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('DriverAuthentications');
  },
};
