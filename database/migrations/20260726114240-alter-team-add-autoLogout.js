'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
     try {
            await queryInterface.addColumn('Teams', 'isAutoLogoutEnabled', {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
            });
            await queryInterface.addColumn('Teams', 'workHours', {
                allowNull: true,
                type: Sequelize.ARRAY(Sequelize.STRING),
            });
        } catch (e) {
            console.log(e);
        }
  },

  async down (queryInterface, Sequelize) {
      await queryInterface.removeColumn('Teams', 'isAutoLogoutEnabled');
      await queryInterface.removeColumn('Teams', 'workHours');
  }
};
