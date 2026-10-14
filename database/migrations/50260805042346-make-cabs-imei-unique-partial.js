'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // 50260805042345 added a plain UNIQUE index on Cabs.imei, but Cabs is
  // paranoid: true - a soft-deleted cab kept occupying its IMEI at the DB level
  // while being invisible to the app-level check (assertImeiUnique's findOne
  // skips deleted rows). Re-fitting a tracker to a new cab therefore passed the
  // friendly check and then died on a raw SequelizeUniqueConstraintError.
  // Scoping the index to live rows makes the two agree.
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // '' could not previously reach the column (@Matches rejected it), but the
      // DTO now accepts it as "clear the IMEI". Postgres treats '' as a real
      // value under a unique index while exempting NULL, so fold any legacy
      // blanks to NULL before building the index.
      await queryInterface.sequelize.query(
        `UPDATE "Cabs" SET "imei" = NULL WHERE "imei" = '';`,
        { transaction },
      );

      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "cabs_imei";`, {
        transaction,
      });

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "cabs_imei_unique_active"
           ON "Cabs" ("imei")
           WHERE "deletedAt" IS NULL;`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS "cabs_imei_unique_active";`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "cabs_imei" ON "Cabs" ("imei");`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
