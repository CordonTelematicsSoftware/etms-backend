import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  BelongsTo,
  ForeignKey,
  HasOne,
  AutoIncrement,
  HasMany,
} from 'sequelize-typescript';
import sequelize from 'sequelize';
import { Gender, Status, EmployeeType } from 'src/shared/enums';
import { Role } from 'src/role/models/role.model';
import { Profile } from 'src/profile/model/profile.model';
import { Team } from 'src/team/models/team.model';
import { Process } from 'src/process/models/process.model';
import { Organization } from 'src/organization/models/organization.model';
import { Authentication } from 'src/auth/models/authentication.model';
import { CommonPoint } from 'src/location-management/commonPoints/models/commonPoint.model';
import { Location } from 'src/location-management/locations/models/location.model';
import { ApprovalRequest } from 'src/approval-request/models/approval-request.model';
import { Costcenter } from 'src/costcenter/model/costcenter.model';
import { EmployeeDeviceInfo } from 'src/auth/models/employee-device-model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class Employee extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column
  name: string;

  @Column
  employeeCode: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  email: string;

  @Column({ allowNull: true })
  gender: Gender;

  @Column
  phone: string;

  @Column
  designation: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  joinedDate: Date;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  exitDate: Date | null;

  @Column
  specialConsideration: string;

  @Column
  address: string;

  @Column
  landmark: string;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  @Column({ allowNull: true })
  homePoint: string;

  @Column
  employeeType: EmployeeType;

  @Column({ allowNull: true })
  commuteDistance: string;

  @Column({ allowNull: true })
  commuteTime: string;

  @Column({ allowNull: true })
  sortOrder: string;

  @ForeignKey(() => Role)
  @Column(sequelize.BIGINT)
  roleID: bigint;

  @BelongsTo(() => Role, {
    foreignKey: 'roleID',
    as: 'role',
  })
  role: Role;

  @ForeignKey(() => Employee)
  @Column(sequelize.BIGINT)
  reportingID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'reportingID',
    as: 'report',
  })
  report: Employee;

  @HasOne(() => Profile, { foreignKey: 'employeeID' })
  profileInput: Profile;

  @HasOne(() => Authentication, { foreignKey: 'employeeID' })
  authInput: Authentication;

  @ForeignKey(() => Organization)
  @Column(sequelize.BIGINT)
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'organization',
  })
  organization: Organization;

  @ForeignKey(() => Location)
  @Column(sequelize.BIGINT)
  locationID: string;

  @BelongsTo(() => Location, {
    foreignKey: 'locationID',
    as: 'location',
  })
  location: Location;
  @ForeignKey(() => CommonPoint)
  @Column(sequelize.BIGINT)
  commonPointID: string;

  @BelongsTo(() => CommonPoint, {
    foreignKey: 'commonPointID',
    as: 'commonPoint',
  })
  commonPoint: CommonPoint;
  @ForeignKey(() => Team)
  @Column(sequelize.BIGINT)
  teamID: bigint;

  @BelongsTo(() => Team, {
    foreignKey: 'teamID',
    as: 'team',
  })
  team: Team;

  @ForeignKey(() => Process)
  @Column(sequelize.BIGINT)
  processID: bigint;

  @BelongsTo(() => Process, {
    foreignKey: 'processID',
    as: 'process',
  })
  process: Process;

  @ForeignKey(() => Costcenter)
  @Column(sequelize.BIGINT)
  costcenterID: bigint;

  @BelongsTo(() => Costcenter, {
    foreignKey: 'costcenterID',
    as: 'costcenter',
  })
  costcenter: Costcenter;

  // @Column({ defaultValue: false })
  // exit: Status;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  exit: boolean;

  @HasMany(() => ApprovalRequest, { foreignKey: 'employeeID' })
  approvalRequest: ApprovalRequest;

  @HasMany(() => EmployeeDeviceInfo, { foreignKey: 'employeeID' })
  employeeDeviceInfo: EmployeeDeviceInfo[];
}
