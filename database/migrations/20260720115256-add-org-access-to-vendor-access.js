'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('VendorAccesses', 'orgIDs', {
      type: Sequelize.ARRAY(Sequelize.BIGINT),
      allowNull: true,
      defaultValue: [],
    });
    await queryInterface.addColumn('VendorAccesses', 'authID', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'Authentications', key: 'id' },
      onDelete: 'SET NULL',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('VendorAccesses', 'orgIDs');
    await queryInterface.removeColumn('VendorAccesses', 'authID');
  },
};