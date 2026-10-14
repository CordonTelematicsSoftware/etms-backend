'use strict';
/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Processes', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT,
            },
            name: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            description: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            status: { type: Sequelize.STRING },
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
        await queryInterface.dropTable('Processes');
    },
};
