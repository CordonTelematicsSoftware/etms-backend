'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Costcenters', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT,
            },
            name: {
                type: Sequelize.STRING,
            },

            processID: {
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Processes',
                    },
                    key: 'id',
                },
            },
            teamID: {
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Teams',
                    },
                    key: 'id',
                },
            },
            orgID: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: {
                    model: {
                        tableName: 'Organizations',
                    },
                    key: 'id',
                },
            },
            status: { type: Sequelize.STRING },
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
        await queryInterface.dropTable('Costcenters');
    },
};
