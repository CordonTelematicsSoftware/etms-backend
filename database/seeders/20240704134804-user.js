'use strict';
// To Run leaves seeder => npx sequelize-cli db:seed --seed 20231204134805-user.js
// To Run All Seeder => npx sequelize-cli db:seed:all
/** @type {import('sequelize-cli').Migration} */
// eslint-disable-next-line @typescript-eslint/no-var-requires
// import * as bcrypt from 'bcryptjs';
const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (!bootstrapPassword) {
      throw new Error(
        'BOOTSTRAP_ADMIN_PASSWORD environment variable is required',
      );
    }

    const hashedPassword = await bcrypt.hash(bootstrapPassword, 12);

    return Promise.all([
      queryInterface.bulkInsert('Roles', [
        {
          name: 'Administrator',

          permissions:
            '{Member-Read,Member-Create,Member-Update,Member-Delete}',
          orgID: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Organization Admin',
          permissions:
            '{Employee-Read,Employee-Create,Employee-Update,"Transport Team-Read","Transport Team-Create","Transport Team-Update",Process-Read,Process-Create,Process-Update,CostCenter-Read,CostCenter-Create,CostCenter-Update,Roles-Read,Roles-Create,Roles-Update,Roles-Delete,Zone-Create,Zone-Update,Zone-Read,Zone-Delete,"Common Point-Read","Common Point-Update","Common Point-Create","Common Point-Delete","Organization Vendor Request-Create","Organization Vendor Request-Read","Organization Vendor Request-Update","Vendors invite-Create",Config-Read,Config-Update,"Trip Requests-Read","Trip Requests-Create","Trip Requests-Delete","Trips-Read","Trips-Create","Trips-Update","Trips-Delete","Tripsheet Upload-Read","Manual Edit-Read","Manual Edit-Create","Manual Edit-Update","Manual Edit-Delete",Routes-Read,Routes-Create,Routes-Update,Routes-Delete,Organization-Update,Transporter-Read,Transporter-Create,Transporter-Update,Transporter-Delete,"Team Trip Requests-Read","Team Trip Requests-Create","Team Trip Requests-Update","Team Trip Requests-Delete","Trip Requests-Update",Employee-Delete,Trip-Read,Trip-Create,Trip-Update,Trip-Delete," Cost Center-Read"," Cost Center-Create"," Cost Center-Update"," Cost Center-Delete","Vendors List-Read","Vendors List-Create","Vendors List-Update","Vendors List-Delete","Organization Vendor Request-Delete",Config-Create,Config-Delete,Process-Delete,Team-Read,Team-Create,Team-Update,Team-Delete,Vendor-Read,Vendor-Update,Assign Cabs-Read,Assign Cabs-Create,Assign Drivers-Read,Assign Drivers-Create,Security-Read,Security-Create,Security-Update,Security-Delete,EventLog-Read,EventLog-Create,EventLog-Update,EventLog-Delete,Announcement-Read,Announcement-Create,Announcement-Update,Announcement-Delete,Grievance-Read,GmsCategory-Read,GmsCategory-Delete,Event-Create}',
          orgID: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      queryInterface.bulkInsert('Authentications', [
        {
          email: 'admin@techtaliya.com',
          phone: 9876543210,
          userType: 'SuperAdmin',
          name: 'SuperAdmin',
          hashedPassword,
          // verified: true,
          passwordCreatedAt: new Date(),
          status: 'Active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),

      queryInterface.bulkInsert('Employees', [
        {
          name: 'employee',
          employeeCode: 'EMP-133',
          email: 'admin@org.com',
          phone: 9876543210,
          gender: 'Male',
          status: 'Active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      queryInterface.bulkInsert('Authentications', [
        {
          email: 'admin@org.com',
          phone: 9876543210,
          userType: 'Employee',
          name: 'Employee',
          hashedPassword,
          // verified: true,
          passwordCreatedAt: new Date(),
          employeeID: 1,
          status: 'Active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      queryInterface.bulkInsert('PasswordHistories', [
        {
          employeeID: 1,
          hashedPassword,
          createdDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    ]);
  },
};
