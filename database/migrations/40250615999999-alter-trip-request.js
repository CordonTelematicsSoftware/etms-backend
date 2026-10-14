/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            await queryInterface.addColumn('TripRequests', 'ratings', {
                allowNull: true,
                type: Sequelize.INTEGER,
                defaultValue: 0,
            });
             await queryInterface.addColumn('TripRequests', 'comments', {
                allowNull: true,
                type: Sequelize.STRING,
            });
        } catch (e) {
            console.log(e);
        }
    },
    async down(queryInterface) {
        await queryInterface.removeColumn('TripRequests', 'ratings');
        await queryInterface.removeColumn('TripRequests', 'comments');
    },
};
