'use strict';
/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('OrganizationCabs', {
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
      // tripID: {
      //   type: Sequelize.BIGINT,
      //   allowNull: true,
      //   references: {
      //     model: {
      //       tableName: 'Trips',
      //     },
      //     key: 'id',
      //   },
      // },
      // shiftTime: {
      //   allowNull: true,
      //   type: Sequelize.STRING,
      // },
      // date: {
      //   allowNull: false,
      //   type: Sequelize.DATE,
      // },
      // pickDrop: {
      //   allowNull: true,
      //   type: Sequelize.STRING,
      // },
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
    await queryInterface.dropTable('OrganizationCabs');
  },
};
