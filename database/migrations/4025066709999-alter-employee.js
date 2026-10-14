'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('Employees', 'costcenterID', {
            allowNull: true,
            type: Sequelize.BIGINT,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('Employees', 'costcenterID');
    },
};
