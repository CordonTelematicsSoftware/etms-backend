'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('ApprovalRequests', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT,
            },
            requestedBy: {
                type: Sequelize.STRING
            },
            cabID: {
                allowNull: true,
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Cabs',
                    },
                    key: 'id',
                },
            },
            driverID: {
                allowNull: true,
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Drivers',
                    },
                    key: 'id',
                },
            },
            vendorID: {
                allowNull: true,
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Vendors',
                    },
                    key: 'id',
                },
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
            approvedOn: {
                type: Sequelize.DATE,
            },
            oldRecord: {
                type: Sequelize.JSONB,
            },
            newRecord: {
                type: Sequelize.JSONB,
            },
            status: {
                type: Sequelize.ENUM('Pending', 'Approved', 'Rejected','Cancelled'),
                defaultValue: 'Pending',
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
        await queryInterface.dropTable('ApprovalRequests');
    },
};
