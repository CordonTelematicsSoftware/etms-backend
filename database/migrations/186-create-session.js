'use strict';
/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Sessions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      userID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Authentications',
          },
          key: 'id',
        },
      },
      name: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      orgID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Organizations',
          },
          key: 'id',
        },
      },
      token: {
        allowNull: false,
        type: Sequelize.TEXT,
      },
      expiry: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      invalidated: {
        allowNull: false,
        defaultValue: false,
        type: Sequelize.BOOLEAN,
      },
      permissions: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
      },
      userType: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      employeeID: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      vendorUserID: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      vendorID: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      driverID: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      roleID: {
        type: Sequelize.BIGINT,
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
    await queryInterface.dropTable('Sessions');
  },
};
