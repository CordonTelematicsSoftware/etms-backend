'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Employees', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      name: {
        type: Sequelize.STRING,
      },
      employeeCode: {
        type: Sequelize.STRING,
      },
      email: {
        type: Sequelize.STRING,
      },
      phone: {
        type: Sequelize.STRING,
      },
      designation: {
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
      locationID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Locations',
          },
          key: 'id',
        },
      },
      commonPointID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'CommonPoints',
          },
          key: 'id',
        },
      },
      homePoint: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      gender: {
        type: Sequelize.STRING,
      },
      specialConsideration: {
        type: Sequelize.STRING,
      },
      address: {
        type: Sequelize.STRING,
      },
      landmark: {
        type: Sequelize.STRING,
      },
      joinedDate: {
        type: Sequelize.DATEONLY,
      },
      exitDate: { type: Sequelize.DATEONLY },
      commuteDistance: {
        type: Sequelize.STRING,
      },
      commuteTime: {
        type: Sequelize.STRING,
      },
      sortOrder: {
        type: Sequelize.STRING,
      },
      employeeType: { type: Sequelize.STRING },
      roleID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Roles',
          },
          key: 'id',
        },
      },
      reportingID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Employees',
          },
          key: 'id',
        },
      },
      teamID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Teams',
          },
          key: 'id',
        },
      },
      processID: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: {
            tableName: 'Processes',
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
    await queryInterface.dropTable('Employees');
  },
};
