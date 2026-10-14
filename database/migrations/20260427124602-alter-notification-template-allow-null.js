'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('NotificationTemplates', 'providerTemplateId', {
      type: Sequelize.STRING(150),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // First null out any nulls so we can re-add the NOT NULL constraint
    await queryInterface.sequelize.query(`
      UPDATE "NotificationTemplates"
      SET "providerTemplateId" = ''
      WHERE "providerTemplateId" IS NULL;
    `);

    await queryInterface.changeColumn('NotificationTemplates', 'providerTemplateId', {
      type: Sequelize.STRING(150),
      allowNull: false,
    });
  },
};