'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Logs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      method: {
        type: Sequelize.STRING,
      },
      request: {
        type: Sequelize.JSONB,
      },
      response: {
        type: Sequelize.JSONB,
      },
      ipaddress: {
        type: Sequelize.STRING,
      },

      description: {
        type: Sequelize.STRING,
      },
      searchText: {
        type: Sequelize.TSVECTOR,
      },
      authID: {
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'Authentications',
          },
          key: 'id',
        },
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
    return queryInterface.dropTable('Logs');
  },
};
