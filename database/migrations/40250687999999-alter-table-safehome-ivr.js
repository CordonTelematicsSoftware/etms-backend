'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('SafeHomeIVRHistories', 'orgID', {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
                model: 'Organizations',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
        });
        await queryInterface.addColumn('SafeHomeIVRHistories', 'tripID', {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
                model: 'Trips',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
        });
        await queryInterface.addColumn('SafeHomeIVRHistories', 'refID', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn('SafeHomeIVRHistories', 'callDuration', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn('SafeHomeIVRHistories', 'recordingUrl', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn('SafeHomeIVRHistories', 'callType', {
            type: Sequelize.ENUM(
                'SAFE_HOME',
                'EMPLOYEE_TO_DRIVER',
                'DRIVER_TO_EMPLOYEE'
            ),
            allowNull: true,
        });
        await queryInterface.addColumn('SafeHomeIVRHistories', 'driverPhone', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn('SafeHomeIVRHistories', 'callCount', {
            type: Sequelize.INTEGER,
            allowNull: true,
        });

        await queryInterface.addColumn('SafeHomeIVRHistories', 'callCost', {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('SafeHomeIVRHistories', 'orgID');
        await queryInterface.removeColumn('SafeHomeIVRHistories', 'tripID');
        await queryInterface.removeColumn('SafeHomeIVRHistories', 'refID');
        await queryInterface.removeColumn('SafeHomeIVRHistories', 'callDuration');
        await queryInterface.removeColumn('SafeHomeIVRHistories', 'recordingUrl');
        await queryInterface.removeColumn('SafeHomeIVRHistories', 'callType');
        await queryInterface.removeColumn('SafeHomeIVRHistories', 'driverPhone');
        await queryInterface.removeColumn('SafeHomeIVRHistories', 'callCost');
        await queryInterface.removeColumn('SafeHomeIVRHistories', 'callCount');

    },
};