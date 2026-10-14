'use strict';

/**
 * Background save jobs for the Routing page.
 *
 * POST /admin/trip and PUT /admin/trip/trips-by-date run ~2 minutes inline
 * because TripService.create() issues one live Google Directions call per trip,
 * chunked five at a time. The admin client's axios timeout is 100s, so the
 * browser cancels, the operator retries, and the retry creates a duplicate set.
 * The async routes write a row here, return its id, and a worker does the work.
 *
 * NO UNIQUE INDEX, deliberately: two identical saves must produce two rows.
 * De-duplication is the existing guard in TripService.create() (trip.service.ts
 * :160-219), which reads the Trips table itself; a unique index here would
 * instead reject the second enqueue, hiding a real double-submit behind a
 * constraint violation the operator cannot act on.
 *
 * payload and context are nullable because finish() wipes both on completion,
 * success or failure. Nothing reads them after the job ends — there is no retry
 * — and a payload column holding 6 MB per save would dominate the table.
 *
 * One index on (status, id): the worker's only scan is
 * WHERE status = 'pending' ORDER BY id ASC LIMIT 1.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('TripSaveJobs', {
            id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                primaryKey: true,
                autoIncrement: true,
            },
            // FK matches ScheduleReminderSchedules. Also the tenancy boundary: the
            // status endpoint filters on it so one org cannot poll another's job.
            orgID: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: { model: 'Organizations', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            // 'create' | 'update' — which TripService method the worker calls.
            kind: { type: Sequelize.STRING, allowNull: false },
            // CreateTripInput[] for 'create', UpdateTripInput for 'update'.
            payload: { type: Sequelize.JSONB, allowNull: true },
            // { user: {id, orgID, name, userType, vendorID}, shiftTime, date }
            context: { type: Sequelize.JSONB, allowNull: true },
            // 'pending' | 'running' | 'done' | 'failed'
            status: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: 'pending',
            },
            // Incremented by the claim UPDATE itself. The cap is 1: a second claim
            // means the first run crashed, and that job is failed, never re-run.
            attempts: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            claimedAt: { type: Sequelize.DATE, allowNull: true },
            finishedAt: { type: Sequelize.DATE, allowNull: true },
            error: { type: Sequelize.STRING, allowNull: true },
            resultMessage: { type: Sequelize.STRING, allowNull: true },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });

        // The worker's only scan.
        await queryInterface.addIndex('TripSaveJobs', {
            name: 'trip_save_jobs_status_id',
            fields: ['status', 'id'],
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('TripSaveJobs');
    },
};