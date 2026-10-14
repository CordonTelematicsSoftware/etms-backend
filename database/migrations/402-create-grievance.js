'use strict';

/** @type {import('sequelize-cli').Migration} */
// Run => npx sequelize-cli db:migrate

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Grievances', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },

      grievanceId: {
        allowNull: false,
        type: Sequelize.STRING,
      },

      categoryId: {
        allowNull: false,
        type: Sequelize.BIGINT,
        references: {
          model: 'GmsCategories',
          key: 'id',
        },
      },

      description: {
        allowNull: false,
        type: Sequelize.TEXT,
      },

      attachments: {
        allowNull: true,
        type: Sequelize.JSONB,
      },

      createdById: {
        allowNull: false,
        type: Sequelize.BIGINT,
        references: {
          model: 'Employees',
          key: 'id',
        },
      },

      transportTeamId: {
        allowNull: true,
        type: Sequelize.STRING,
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
        defaultValue: 'Submitted',
      },

      remarks: {
        allowNull: true,
        type: Sequelize.STRING,
      },

      userType: {
        allowNull: true,
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

      deletedAt: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Grievances');

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Grievances_status";',
    );
  },
};
