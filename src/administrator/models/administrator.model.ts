import {
  Column,
  Model,
  PrimaryKey,
  Table,
  ForeignKey,
  BelongsTo,
  DataType,
  AllowNull,
  AutoIncrement,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { User } from '../../user/models/user.model';
import { Gender } from 'src/shared/enums';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Administrator extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @ForeignKey(() => User)
  @Column(sequelize.BIGINT)
  userID: bigint;

  @BelongsTo(() => User, {
    foreignKey: 'userID',
    as: 'user',
  })
  user: User;

  @Column
  fullName: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100), allowNull: true })
  email: string;

  @Column({ allowNull: true })
  gender: Gender;

  @Column
  phone: string;

  @ForeignKey(() => User)
  @Column(sequelize.BIGINT)
  createdBy: bigint;

  @BelongsTo(() => User, {
    foreignKey: 'createdBy',
    as: 'createdByUser',
  })
  createdByUser: User;
}
