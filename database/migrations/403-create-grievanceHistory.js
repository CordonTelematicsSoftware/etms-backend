'use strict';

/** @type {import('sequelize-cli').Migration} */
// Run => npx sequelize-cli db:migrate

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('GrievanceHistories', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },

      grievanceId: {
        allowNull: false,
        type: Sequelize.BIGINT,
        references: {
          model: 'Grievances',
          key: 'id',
        },
      },

      status: {
        type: Sequelize.ENUM(
          'Submitted',
          'Inprogress',
          'Resolved',
          'Closed',
          'Rejected',
        ),
        allowNull: false,
      },

      remarks: {
        allowNull: true,
        type: Sequelize.STRING,
      },

      createdById: {
        allowNull: false,
        type: Sequelize.BIGINT,
        references: {
          model: 'Employees',
          key: 'id',
        },
      },

      updatedById: {
        allowNull: true,
        type: Sequelize.BIGINT,
        references: {
          model: 'Employees',
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
    await queryInterface.dropTable('GrievanceHistories');

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_GrievanceHistories_status";',
    );
  },
};
