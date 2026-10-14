'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Securities', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      name: {
        type: Sequelize.STRING,
      },
      securityCode: {
        type: Sequelize.STRING,
      },
      phone1: {
        type: Sequelize.STRING,
      },
      phone2: {
        type: Sequelize.STRING,
      },
      gender: {
        type: Sequelize.STRING,
      },
      dob: {
        type: Sequelize.STRING,
      },
      address: {
        type: Sequelize.STRING,
      }, 
      bloodGroup: {
        type: Sequelize.STRING,
      },
      aadharNumber: {
        type: Sequelize.STRING,
      },
      emergencyContactNo: {
        type: Sequelize.STRING,
      },
      emergencyContactName: {
        type: Sequelize.STRING,
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
      createdBy: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Authentications',
          },
          key: 'id',
        },
      },
      status: { type: Sequelize.STRING },
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
    await queryInterface.dropTable('Securities');
  },
};
