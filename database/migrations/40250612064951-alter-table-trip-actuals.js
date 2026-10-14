/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            await queryInterface.addColumn('TripActuals', 'remarks', {
                allowNull: true,
                type: Sequelize.STRING,
            });
        } catch (e) {
            console.log(e);
        }
    },
    async down(queryInterface) {
        await queryInterface.removeColumn('TripActuals', 'remarks');
    },
};
