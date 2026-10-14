/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            await queryInterface.addColumn('Teams', 'shiftLoginTime', {
                allowNull: true,
                type: Sequelize.ARRAY(Sequelize.STRING),
            });
            await queryInterface.addColumn('Teams', 'shiftLogoutTime', {
                allowNull: true,
                type: Sequelize.ARRAY(Sequelize.STRING),
            });
            await queryInterface.addColumn('Teams', 'isShiftEnabled', {
                type: Sequelize.BOOLEAN,
                default: false
            });
        } catch (e) {
            console.log(e);
        }
    },
    async down(queryInterface) {
        await queryInterface.removeColumn('Teams', 'shiftLoginTime');
        await queryInterface.removeColumn('Teams', 'shiftlogoutTime');
        await queryInterface.removeColumn('Teams', 'isShiftEnabled');
    },
};
