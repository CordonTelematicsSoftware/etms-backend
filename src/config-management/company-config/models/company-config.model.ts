import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { ConfigurationMaster } from 'src/config-management/config/models/config.model';
import { Employee } from 'src/employee/models/employee.model';
import { Organization } from 'src/organization/models/organization.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class CompanyConfiguration extends Model {
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
  })
  id: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  configValue: string;

  @ForeignKey(() => ConfigurationMaster)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  configID: string;

  @ForeignKey(() => Organization)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  orgID: bigint;

  @ForeignKey(() => Employee)
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  createdBy: bigint;

  @BelongsTo(() => ConfigurationMaster, {
    foreignKey: 'configID',
    as: 'configurationMaster',
  })
  configurationMaster: ConfigurationMaster;
}
