'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('ReportSchedulers', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT,
            },
            reportName: {
                type: Sequelize.STRING
            },
            orgID: {
                allowNull: true,
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Organizations',
                    },
                    key: 'id',
                },
            },
            frequency: {
                type: Sequelize.ARRAY(Sequelize.STRING),
            },
            time: {
                type: Sequelize.ARRAY(Sequelize.STRING),
            },
            dateRangeType: {
                type: Sequelize.STRING,
                allowNull: false,
            },

            dateRangeValue: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            employeeID: {
                allowNull: true,
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Employees',
                    },
                    key: 'id',
                },
            },
            employeeCode: {
                type: Sequelize.STRING
            },
            recipients: {
                type: Sequelize.ARRAY(Sequelize.STRING),
            },
            status: {
                type: Sequelize.STRING
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
        await queryInterface.dropTable('ReportSchedulers');
    },
};
