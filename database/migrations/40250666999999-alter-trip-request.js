/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            await queryInterface.addColumn('TripRequests', 'cabArrivedAt', {
                allowNull: true,
                type: Sequelize.DATE,
            });
            await queryInterface.addColumn('TripRequests', 'markCabReached', {
                allowNull: true,
                type: Sequelize.BOOLEAN,
            });
            await queryInterface.addColumn('TripRequests', 'cabWaitingTime', {
                allowNull: true,
                type: Sequelize.DATE,
            });
        } catch (e) {
            console.log(e);
        }
    },
    async down(queryInterface) {
        await queryInterface.removeColumn('TripRequests', 'cabArrivedAt');
        await queryInterface.removeColumn('TripRequests', 'markCabReached');
        await queryInterface.removeColumn('TripRequests', 'cabWaitingTime');

    },
};
