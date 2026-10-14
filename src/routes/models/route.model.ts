import sequelize from 'sequelize';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Organization } from 'src/organization/models/organization.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Route extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: true,
  })
  zoneIDs: number[];

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  // @Column({
  //   type: DataType.FLOAT,
  //   defaultValue: 10.0,
  //   comment: 'Average speed in kilometers per hour',
  // })
  // avgSpeedKmph: number;

  /// Avg speed  10kmph
}
