'use strict';
// To Run leaves seeder => npx sequelize-cli db:seed --seed 20231204134805-user.js
// To Run All Seeder => npx sequelize-cli db:seed:all
/** @type {import('sequelize-cli').Migration} */
// eslint-disable-next-line @typescript-eslint/no-var-requires

module.exports = {
  async up(queryInterface) {
    return Promise.all([
      queryInterface.bulkInsert('VendorRoles', [
        {
          name: 'Vendor Admin',
          permissions:
          '{Drivers-Update,Drivers-Read,Drivers-Delete,Drivers-Create,Cabs-Update,Cabs-Create,Cabs-Delete,Cabs-Read,Organizations-Read,"Organization Vendor Request-Create","Organization Vendor Request-Read","Organization Vendor Request-Update","Organization Vendor Request-Delete",Organization-Read,"Vendor Roles-Create","Vendor Roles-Read","Vendor Roles-Update","Vendor Roles-Delete",Brand-Read,Brand-Update,Brand-Create,Brand-Delete,"Assign Cabs-Create","Assign Cabs-Read","Assign Drivers-Create","Assign Drivers-Read","Trip-Read","Trip-Update","Trip Requests-Read"}',
            // '{Driver-Update,Driver-Read,Driver-Delete,Driver-Create,Cab-Update,Cab-Create,Cab-Delete,Cab-Read,Organizations-Read,Vendor-role-Create,Vendor-role-Read,Vendor-role-Update,Vendor-role-Delete,Organization Vendor Request-Create,Organization Vendor Request-Read,Organization Vendor Request-Update,Organization Vendor Request-Delete,Organization-Read,Vendor Roles-Create,Vendor Roles-Read,Vendor Roles-Update,Vendor Roles-Delete,Brand-Read,Brand-Update,Brand-Create,Brand-Delete,Assign Cabs-Create,Assign Cabs-Read, Assign Drivers-Create, Assign Drivers-Read}',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    ]);
  },
};