import sequelize from 'sequelize';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Employee } from 'src/employee/models/employee.model';
import { Location } from 'src/location-management/locations/models/location.model';
import { Organization } from 'src/organization/models/organization.model';
import { Process } from 'src/process/models/process.model';
import { EmergencyType, Status } from 'src/shared/enums';
import { Team } from 'src/team/models/team.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';

@Table({
  timestamps: true,
  paranoid: true,
})
export class TripRequest extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @ForeignKey(() => Organization)
  @Column
  orgID: bigint;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'org',
  })
  org: Organization;

  @ForeignKey(() => Employee)
  @Column
  employeeID: bigint;

  @BelongsTo(() => Employee, {
    foreignKey: 'employeeID',
    as: 'employee',
  })
  employee: Employee;

  @Column
  employeeCode: string;

  @ForeignKey(() => Team)
  @Column
  teamID: bigint;

  @BelongsTo(() => Team, {
    foreignKey: 'teamID',
    as: 'team',
  })
  team: Team;

  @ForeignKey(() => Process)
  @Column
  processID: bigint;

  @BelongsTo(() => Process, {
    foreignKey: 'processID',
    as: 'process',
  })
  process: Process;

  @Column
  date: string;

  @Column
  shiftTime: string;

  @Column
  pickDrop: boolean;

  @Column
  pickUpTime: string;

  @Column
  dropTime: string;

  @Column({ defaultValue: Status.Active, allowNull: true })
  status: Status;

  @ForeignKey(() => Trip)
  @Column({ allowNull: true })
  tripID: bigint;

  @BelongsTo(() => Trip, {
    foreignKey: 'tripID',
    as: 'trip',
  })
  trip: Trip;

  @ForeignKey(() => Location)
  @Column({ allowNull: true })
  locationID: bigint;

  @BelongsTo(() => Location, {
    foreignKey: 'locationID',
    as: 'location',
  })
  location: Location;

  @Column({ allowNull: true })
  locationType: string;

  @Column({ allowNull: true })
  officeLocation: string;

  @Column({ allowNull: true })
  geoCode: string;

  @Column({ allowNull: true })
  locationName: string;

  @Column({ allowNull: true })
  attendanceMode: string;

  @Column({ allowNull: true })
  attendanceOtp: string;

  @Column({ allowNull: true })
  attendance: boolean;

  @Column({ allowNull: true })
  attendanceLocation: string;

  @Column({ allowNull: true })
  attendanceTime: string;

  @Column({ allowNull: true, defaultValue: null })
  noShow: boolean;

  @Column({ allowNull: true })
  deboard: boolean;

  @Column({ allowNull: true })
  deboardLocation: string;

  @Column({ allowNull: true })
  deboardTime: string;

  @Column({ allowNull: true })
  safeHome: boolean;

  @Column({ allowNull: true })
  safeHomeTime: string;

  @Column({ allowNull: true })
  emergencyType: EmergencyType;

  @Column({ allowNull: true })
  remarks: string;

  @Column({ defaultValue: 0 })
  ratings: number;

  @Column({ allowNull: true })
  comments: string;

  @Column({ allowNull: true })
  cabArrivedAt: Date;

  @Column({ allowNull: true })
  cabWaitingTime: Date;

  @Column({ allowNull: true })
  markCabReached: boolean;

  // How the driver marked the deboard: 'PIN' or 'Manual'. Authoritative — the
  // deboardMode inside Trips.employees JSON is unreliable (the manual path
  // never sets it, and validateDeboardDeviation can overwrite the blob).
  @Column({ allowNull: true })
  deboardMode: string;
}
