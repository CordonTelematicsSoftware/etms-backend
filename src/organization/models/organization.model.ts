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
import { City } from 'src/city/models/city.model';
import { Employee } from 'src/employee/models/employee.model';
import { Status } from 'src/shared/enums';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Organization extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column({ type: DataType.STRING(100), validate: { isEmail: true } })
  email: string;

  @Column
  phone: string;

  @Column({ allowNull: true })
  gstNo: string;

  @Column({ allowNull: true })
  address: string;

  // @ForeignKey(() => City)
  // @Column(sequelize.BIGINT)
  // cityID: bigint;
  @BelongsTo(() => City, {
    foreignKey: 'cityID',
    as: 'city',
  })
  city: City;

  @Column({ allowNull: true })
  state: string;

  @Column({ allowNull: true })
  country: string;

  @Column({ allowNull: true })
  location: string;

  @Column({ allowNull: true })
  geoCode: string;

  @Column({ allowNull: true })
  domainName: string;

  @Column({ allowNull: true })
  logo: string;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  createdBy: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'createdBy',
    as: 'createdByUser',
  })
  createdByUser: Employee;
}
