'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Profiles', 'securityPin', {
      type: Sequelize.STRING,
      allowNull: true,

    });
    await queryInterface.addColumn('Profiles', 'pinResetHashedOtp', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Profiles', 'pinResetOtpCreatedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Profiles', 'securityPin');
    await queryInterface.removeColumn('Profiles', 'pinResetHashedOtp');
    await queryInterface.removeColumn('Profiles', 'pinResetOtpCreatedAt');

  },
};
