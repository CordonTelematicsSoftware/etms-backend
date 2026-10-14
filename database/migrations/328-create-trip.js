'use strict';

const { isPartiallyEmittedExpression } = require('typescript');

/** @type {import('sequelize-cli').Migration} */
// Run Migration => npx sequelize-cli db:migrate

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Trips', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT,
            },
            routeNumber: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            vendorCode: {
                allowNull: true,
                type: Sequelize.STRING,
                // references: {
                //   model: {
                //     tableName: 'Vendors',
                //   },
                //   key: 'code',
                // },
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
            seats: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            employees: {
                allowNull: true,
                type: Sequelize.JSONB,
                // references: {
                //     model: {
                //         tableName: 'Employees',
                //     },
                //     key: 'id',
                // },
            },
            spock: {
                allowNull: true,
                type: Sequelize.BOOLEAN,
            },
            toll: {
    allowNull: true,
    type: Sequelize.BOOLEAN,
    defaultValue: false,
},
            scheduledTime: {
                allowNull: true,
                type: Sequelize.STRING,
            },

            plannedTime: {
                allowNull: true,
                type: Sequelize.STRING,
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
            orgID: {
                allowNull: true,
                type: Sequelize.BIGINT,
                // references: {
                //     model: {
                //         tableName: 'Organizations',
                //     },
                //     key: 'id',
                // },
            },
            vendorID: {
                allowNull: true,
                type: Sequelize.BIGINT,
                // references: {
                //     model: {
                //         tableName: 'Organizations',
                //     },
                //     key: 'id',
                // },
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
            spockID: {
                allowNull: true,
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Securities',
                    },
                    key: 'id',
                },
            },
            spockCode: {
                allowNull: true,
                type: Sequelize.STRING,

            },
            pickDrop: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            estimatedOccupancy: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            estimatedStartDateTime: {
                allowNull: true,
                type: Sequelize.DATE,
            },
            estimatedEndDateTime: {
                allowNull: true,
                type: Sequelize.DATE,
            },
            estimatedDistance: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            estimatedCost: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            tripLocation: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            status: {
                type: Sequelize.ENUM('Pending', 'Confirmed', 'Ongoing', 'Completed', 'Cancelled'),
                allowNull: false,
                defaultValue: 'Pending'
            },
            lockStatus: {
                type: Sequelize.STRING,
            },
            routeID: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            shiftTime: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            date: {
                allowNull: false,
                type: Sequelize.DATEONLY,
            },
            routeLegs: {
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
        await queryInterface.dropTable('Trips');
    },
};
