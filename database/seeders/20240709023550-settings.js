'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    return Promise.all([
      queryInterface.bulkInsert('Settings', [
        {
          id: '100',
          key: 'CASTE_CERTIFICATE',
          code: 'SNDP-1103/CERT/CAS',
          value: '001',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '110',
          key: 'MARRIAGE_CERTIFICATE',
          code: 'SNDP-1103/CERT/MAR',
          value: '001',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '120',
          key: 'FAMILY_CODE_DPK',
          code: 'DPK',
          value: '001',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '130',
          key: 'FAMILY_CODE_KSK',
          code: 'KSK',
          value: '001',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '140',
          key: 'FAMILY_CODE_TMK',
          code: 'TMK',
          value: '001',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '150',
          key: 'FAMILY_CODE_CKK',
          code: 'CKK',
          value: '001',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '1001',
          key: 'CURRENT_YEAR',
          code: 'CURRENT-YEAR',
          value: '2024',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    ]);
  },

  async down(queryInterface) {
    return queryInterface.bulkDelete('Settings', null, {});
  },
};
