'use strict';
/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('Organizations', 'createdBy', {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: 0,
      });

      await queryInterface.addConstraint('Organizations', {
        fields: ['createdBy'],
        type: 'foreign key',
        references: {
          table: 'authentications',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL', // Adjust based on your logic; can be 'CASCADE' or 'SET NULL'
      });
    } catch (e) {
      console.log(e);
    }
  },

  async down(queryInterface) {
    // Then remove the column
    await queryInterface.removeColumn('Organizations', 'createdBy');
  },
};
