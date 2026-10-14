'use strict';

const { isPartiallyEmittedExpression } = require('typescript');

/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('TripActuals', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT,
            },
            tripID: {
                allowNull: false,
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Trips',
                    },
                    key: 'id',
                },
            },
            actualOccupancy: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            actualStartDate: {
                allowNull: true,
                type: Sequelize.DATE,
            },
            actualStartTime: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            actualEndDate: {
                allowNull: true,
                type: Sequelize.DATE,
            },
            actualEndTime: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            actualDistance: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            actualCost: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            billingRate: {
                allowNull: true,
                type: Sequelize.JSONB,
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            deletedAt: {
                allowNull: true,
                type: Sequelize.DATE,
            },
        });
    },
    async down(queryInterface) {
        await queryInterface.dropTable('TripActuals');
    },
};
