/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('Roles', 'employeeType', {
        type: Sequelize.ENUM('Employee', 'Admin', 'Transport Team', 'Security Manager'),
      });
    } catch (e) {
      console.log(e);
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Roles', 'employeeType');
  },
};
