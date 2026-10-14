'use strict';

const { isPartiallyEmittedExpression } = require('typescript');

/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('GmsCategories', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      name: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      description: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      attachmentRequired: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      notificationOn: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      alertEmails: {
        allowNull: true,
        type: Sequelize.JSONB,
      },
      priority: {
        type: Sequelize.ENUM('Low', 'Medium', 'High'),
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
    await queryInterface.dropTable('GmsCategories');
  },
};
