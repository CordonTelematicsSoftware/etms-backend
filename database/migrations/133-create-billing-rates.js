'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('BillingRates', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT,
            },
            orgID: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: {
                    model: {
                        tableName: 'Organizations',
                    },
                    key: 'id',
                },
            },
            vendorID: {
                allowNull: false,
                type: Sequelize.BIGINT,
                references: {
                    model: {
                        tableName: 'Vendors',
                    },
                    key: 'id',
                },
            },
            billingPlan: {
                type: Sequelize.ENUM('Per KM Billing', 'Per Trip & Slab Billing', 'Per Trip Multi-Slab Billing'),
                allowNull: false,
            },
            seats: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            ratePerKm: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true,
            },
            baseFare: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true,
            },
            thresholdKm: {
                type: Sequelize.BIGINT,
                allowNull: true,
            },
            additionalRatePerKm: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true,
            },
            multiSlabRates: {
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

        // Add unique constraint to support upsert
        await queryInterface.addConstraint('BillingRates', {
            fields: ['orgID', 'vendorID', 'seats'],
            type: 'unique',
            name: 'unique_org_vendor_seat',
        });
    },
    async down(queryInterface) {
        await queryInterface.removeConstraint('BillingRates', 'unique_org_vendor_seat');
        await queryInterface.dropTable('BillingRates');
    },
};
