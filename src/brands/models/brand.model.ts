import sequelize from 'sequelize';
import {
  AutoIncrement,
  Column,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Status } from 'src/shared/enums';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Brand extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;
}
