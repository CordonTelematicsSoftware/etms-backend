import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  AutoIncrement,
  AllowNull,
} from 'sequelize-typescript';
import sequelize from 'sequelize';

@Table({
  timestamps: true,
  paranoid: true,
})
export class EmailLog extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  purpose: string;

  @Column({ type: DataType.STRING(100), validate: { isEmail: true } })
  toAddress: string;

  @Column({ defaultValue: true })
  status: boolean;

  @AllowNull(true)
  @Column(DataType.TEXT)
  error: any;
}
