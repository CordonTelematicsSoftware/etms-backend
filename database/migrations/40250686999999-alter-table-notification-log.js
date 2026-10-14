'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('NotificationLogs', 'tripID', {
            type: Sequelize.BIGINT,
            allowNull: true,
        });
        await queryInterface.addColumn('NotificationLogs', 'empID', {
            type: Sequelize.BIGINT,
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('NotificationLogs', 'tripID');
        await queryInterface.removeColumn('NotificationLogs', 'empID');

    },
};