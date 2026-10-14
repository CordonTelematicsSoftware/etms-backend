'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('VendorAccesses', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      name: { type: Sequelize.STRING, allowNull: true },
      email: { type: Sequelize.STRING(100), allowNull: false },
      vendorID: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'Vendors', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
      deletedAt: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('VendorAccesses', ['email'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('VendorAccesses');
  },
};