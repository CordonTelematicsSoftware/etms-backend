/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            await queryInterface.addColumn('Locations', 'tripTime', {
                allowNull: true,
                type: Sequelize.BIGINT,         
        });
        } catch (e) {
            console.log(e);
        }
    },
    async down(queryInterface) {
    await queryInterface.removeColumn('Locations', 'tripTime');
    },
};
