import sequelize from 'sequelize';
import {
  Column,
  Model,
  Table,
  PrimaryKey,
  BelongsTo,
  DataType,
  ForeignKey,
  AllowNull,
  AutoIncrement,
} from 'sequelize-typescript';

import { RequestData } from 'src/shared/interfaces/log-request';
import { Authentication } from 'src/auth/models/authentication.model';

@Table({
  timestamps: true,
  paranoid: true,
  indexes: [{ type: 'FULLTEXT', using: 'GIN', fields: ['searchText'] }],
})
export class Log extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  method: string;

  @Column({ type: DataType.JSONB })
  request: RequestData;

  @Column({ type: DataType.JSONB })
  response: any;

  @Column
  ipaddress: string;

  @Column
  description: string;

  @Column({ type: DataType.TSVECTOR })
  searchText: string;

  @AllowNull(true)
  @ForeignKey(() => Authentication)
  @Column(sequelize.BIGINT)
  authID: string;

  @BelongsTo(() => Authentication, 'authID')
  auth: Authentication;
}
