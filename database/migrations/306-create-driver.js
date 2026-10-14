'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Drivers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      name: {
        type: Sequelize.STRING,
      },
      code: {
        type: Sequelize.STRING,
      },
      email: {
        type: Sequelize.STRING,
      },
      phone: {
        type: Sequelize.STRING,
      },
      address: {
        type: Sequelize.STRING,
      },
      dob: {
        type: Sequelize.STRING,
      },
      aadharNumber: {
        type: Sequelize.STRING,
      },
      image: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      licenseNo: {
        type: Sequelize.STRING,
      },
      licenseExpiry: {
        type: Sequelize.DATEONLY,
      },
      badgeNo: {
        type: Sequelize.STRING,
      },
      badgeExpiry: {
        type: Sequelize.DATEONLY,
      },
      policeClearenceExpiry: {
        type: Sequelize.DATEONLY,
      },
      medFitExpiry: {
        type: Sequelize.DATEONLY,
      },
      bgVerificationExpiry: {
        type: Sequelize.DATEONLY,
      },
      vendorID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Vendors',
          },
          key: 'id',
        },
      },

      status: { type: Sequelize.STRING },
      defaultCabRegNo: { type: Sequelize.STRING },
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
    await queryInterface.dropTable('Drivers');
  },
};
