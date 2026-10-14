/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            await queryInterface.addColumn('Alerts', 'acknowledgedDate', {
                allowNull: true,
                type: Sequelize.DATEONLY,
            });
            await queryInterface.addColumn('Alerts', 'acknowledgedTime', {
                allowNull: true,
                type: Sequelize.STRING,
            });
            await queryInterface.addColumn('Alerts', 'comments', {
                allowNull: true,
                type: Sequelize.STRING,
            });
        } catch (e) {
            console.log(e);
        }
    },
    async down(queryInterface) {
        await queryInterface.removeColumn('Alerts', 'acknowledgedDate');
        await queryInterface.removeColumn('Alerts', 'acknowledgedTime');
        await queryInterface.removeColumn('Alerts', 'comments');
    },
};
