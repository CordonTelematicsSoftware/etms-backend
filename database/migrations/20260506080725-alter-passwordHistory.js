'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
      try {
            await queryInterface.addColumn('PasswordHistories', 'authID', {
                allowNull: true,
                type: Sequelize.BIGINT,
                references: {
                    model: { tableName: 'Authentications' },
                    key: 'id',
                },
            });
   } catch (e) {
            console.log(e);
        }
    },

  async down (queryInterface, Sequelize) {
     await queryInterface.removeColumn('PasswordHistories', 'authID');
  }
};
