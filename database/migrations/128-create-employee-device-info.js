'use strict';
/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('EmployeeDeviceInfos', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT,
            },
            employeeID: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: {
                    model: {
                        tableName: 'Employees',
                    },
                    key: 'id',
                },
            },
            deviceNo: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            deviceToken: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            deviceType: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            appVersion: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            osVersion: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            lastLogin: {
                allowNull: true,
                type: Sequelize.DATE,
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
        await queryInterface.dropTable('EmployeeDeviceInfos');
    },
};
