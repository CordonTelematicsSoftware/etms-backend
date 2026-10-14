<!-- <p align="center" style="background-color: #ffffff;">
  <a href="http://nestjs.com/" target="blank"><img src="https://techtaliya.com/img/techtaliya-logo.5fd90b44.png" width="200" alt="TechTaliya Logo" /></a>
</p> -->

  <p align="center">Connect 1103: ETMS Backendnd Management</p>

## Description

Web Application to manage Members of SNDP Union 1103.
Mobile Application to manage Members of SNDP Union 1103.

## Git

```bash
$ npm run commit
```

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Migration

All files related migration can be found in the folder migrations.

The config.js file is used to setup various environment where the migration is run.

A fresh migration can be done by removing the schema and creatnig a new one. Step is optional if you are working on a new database.

```bash
# Drop the existing schema completely
DROP SCHEMA public CASCADE;
# Create a new schema
CREATE SCHEMA public;

# Set Time Zone
SHOW timezone;
SET timezone = 'Asia/Kolkata';
```

Migrating all tables to the new schema.

```bash
# Migrate all files in the main folder migrations/migrations
npx sequelize-cli db:migrate

# Migrate all files in a sub folder migrations/migrations/autoincrement
npx sequelize-cli db:migrate --migrations-path migrations/migrations/autoincrement
```

_Note: If you want to migrate a specific file, delete name of the table from the table SequelizeMeta and run the migration for that folder._

#### Run Migration in Production Environment

Give Permission to db user using PgAdmin

```bash
npx sequelize-cli db:migrate --env prod
```

## Seeding

Seed all files in the following folders:

- Main Folder
- Features
- Holidays (Need to Publish once migrated)
- Roles

```bash
# Run all seeders in the main directory migrations/migrations/seeders
npx sequelize-cli db:seed:all

npx sequelize-cli db:seed:all --env prod

# Run a single seeder in the main directory migrations/migrations/seeders
npx sequelize-cli db:seed --seed 20230509081829-employmentType.js

# Run all seeders in the directory migrations/migrations\seeders\features
npx sequelize-cli db:seed:all --seeders-path migrations\seeders\features

# Run a specific seeder in the directory migrations/migrations\seeders\features
npx sequelize-cli db:seed --seed 20250212070607-config.js --seeders-path migrations\seeders
```

## Data Import

1. Download Employee file from Google Drive as CSV
   Create RM buddy file from the employee csv by removing all other columns and changing column names

2. Clear the following Tables

```bash
DELETE FROM "PreviousExperiences";

DELETE FROM "LeaveRequests";

DELETE FROM "LeaveMasters";

DELETE FROM "Payscales";

DELETE FROM "RmBuddies";

DELETE FROM "UserFeatures";

DELETE FROM "Onboardings";

DELETE FROM "Profiles";

DELETE FROM "Employees";

DELETE FROM "Users" WHERE "Users"."type" != 'Developer';
```

3. Authenticate

```bash
localhost:8000/auth/login
```

4. Use the token and run the following API Calls

```bash
# Import Employees, Onboardings, Profiles and Users
localhost:8000/import/employee

# Allocate permissions for user features for Employee Role
localhost:8000/import/features

# Import Reporting Managers
localhost:8000/import/rmbuddy

# Calculate leave balance
localhost:8000/import/leaveAccount

# Import Payscale details
localhost:8000/import/salary

# Import all leave requests
localhost:8000/import/leaveRequest

# Import all Previous Experiences
localhost:8000/import/previousExperience
```

## Delopyment

```bash
serverless deploy --stage prod  --aws-profile chizels
```

## Autentication

Employees can login for the first time using their mobile number.


<!-- 
## Development and Support

Project Manager: Siju V
Team Lead: Sachin
Team Technical Support: Jerry and Shyam
Web App Developers: Abitha, Athira
Mobile App Developer: Jacob
Additional: Haritha
Tester Web App: Mareena
Tester Mobile App: Lincy

Project Duration: 2 Months

## Stay in touch

- Author - [Shiju S S](https://techtaliya.com)
- Website - [https://techtaliya.com](<(https://techtaliya.com)>) -->
