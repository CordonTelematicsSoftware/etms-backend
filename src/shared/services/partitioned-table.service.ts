import { Injectable, OnModuleInit } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
// import { Sequelize } from 'sequelize';

@Injectable()
export class PartitionedTableService implements OnModuleInit {
  constructor(private sequelize: Sequelize) {}

  async onModuleInit() {
    // await this.createParentTable();
    // await this.createPartitionForCurrentMonth();
  }

  // Create the parent partitioned table
  private async createParentTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS "EventLogs" (
        id SERIAL PRIMARY KEY,
        objectType VARCHAR(255) NOT NULL,
        objectID BIGINT,
        changeType VARCHAR(50),
        description TEXT,
        updatedBy VARCHAR(255),
        authID INT,
        employeeID INT,
        changeJSON JSONB,
        payloadJSON JSONB,
        createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
        updatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
        deletedAt TIMESTAMP
      ) PARTITION BY RANGE (createdAt);
    `;

    await this.sequelize.query(sql);
  }

  // Create a partition for the current month
  private async createPartitionForCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const tableName = `EventLogs_${year}_${month}`;
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${(parseInt(month) + 1)
      .toString()
      .padStart(2, '0')}-01`;

    const sql = `
      CREATE TABLE IF NOT EXISTS "${tableName}"
      PARTITION OF "EventLogs"
      FOR VALUES FROM ('${startDate}') TO ('${endDate}');
    `;

    await this.sequelize.query(sql);
  }

  // Create a partition dynamically (e.g., for a given month)
  async createPartition(year: number, month: number) {
    const tableName = `EventLogs_${year}_${month}`;
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${(month + 1).toString().padStart(2, '0')}-01`;

    const sql = `
      CREATE TABLE IF NOT EXISTS "${tableName}"
      PARTITION OF "EventLogs"
      FOR VALUES FROM ('${startDate}') TO ('${endDate}');
    `;

    await this.sequelize.query(sql);
  }
}
