// import sequelize from 'sequelize';
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
import { EmployeeType } from 'src/shared/enums';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Role extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column({ type: DataType.STRING(100), validate: { len: [3, 100] } })
  name: string;

  @Column({ type: DataType.ARRAY(DataType.STRING(100)) })
  permissions: string[];

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @Column({ defaultValue: true, allowNull: false })
  enabled: boolean;

  @Column({ allowNull: true })
  employeeType: EmployeeType;
}
