'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CompanyConfigurations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      configValue: {
        type: Sequelize.STRING,
      },
    //   configValue: {
    //     type: Sequelize.ARRAY(Sequelize.STRING),
    //   },
      configID: {
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'ConfigurationMasters',
          },
          key: 'id',
        },
      },
      orgID: {
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Organizations',
          },
          key: 'id',
        },
      },
      createdBy: {
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Employees',
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
    await queryInterface.dropTable('CompanyConfigurations');
  },
};
