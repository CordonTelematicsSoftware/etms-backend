'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('OrgCabRequests', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      cabID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Cabs',
          },
          key: 'id',
        },
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
      driver2ID: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Drivers',
          },
          key: 'id',
        },
      },
      regNo: {
        type: Sequelize.STRING,
      },
      rcOwner: {
        type: Sequelize.STRING,
      },
      rcExpiry: {
        type: Sequelize.DATEONLY,
      },
      color: {
        type: Sequelize.STRING,
      },
      noOfSeats: {
        type: Sequelize.STRING,
      },
      pollutionEndDate: {
        type: Sequelize.DATEONLY,
      },
      manufacturingDate: {
        type: Sequelize.DATEONLY,
      },
      brandID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Brands',
          },
          key: 'id',
        },
      },
      model: {
        type: Sequelize.STRING,
      },
      fuelType: {
        type: Sequelize.STRING,
      },
      insuranceNumber: {
        type: Sequelize.STRING,
      },
      insuranceProvider: {
        type: Sequelize.STRING,
      },
      subVendor: {
        type: Sequelize.STRING,
      },
      insuranceEndDate: {
        type: Sequelize.DATEONLY,
      },
      permitExpiry: {
        type: Sequelize.DATEONLY,
      },
      taxExpiry: {
        type: Sequelize.DATEONLY,
      },
      fitnessExpiry: {
        type: Sequelize.DATEONLY,
      },

      status: { type: Sequelize.STRING },
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
    await queryInterface.dropTable('OrgCabRequests');
  },
};
