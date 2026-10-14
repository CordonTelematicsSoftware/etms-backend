import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  HasMany,
} from 'sequelize-typescript';
import { CompanyConfiguration } from 'src/config-management/company-config/models/company-config.model';
import { Employee } from 'src/employee/models/employee.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class ConfigurationMaster extends Model<ConfigurationMaster> {
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
  configName: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: false,
  })
  configValue: string[];

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  defaultValue: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  status: boolean;

  @ForeignKey(() => Employee)
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  createdBy: bigint;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  editable: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  viewable: boolean;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  notes: string;

  @HasMany(() => CompanyConfiguration, { foreignKey: 'configID' })
  companyConfiguration: CompanyConfiguration;
}
