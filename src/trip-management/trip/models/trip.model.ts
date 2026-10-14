import sequelize from 'sequelize';
import {
  AutoIncrement,
  Column,
  Model,
  PrimaryKey,
  Table,
  DataType,
  BelongsTo,
  HasOne,
  HasMany,
} from 'sequelize-typescript';
// import { Cab } from 'src/cabs/models/cab.model';
// import { Driver } from 'src/drivers/models/driver.model';
// import { Organization } from 'src/organization/models/organization.model';
import { Cab } from 'src/cabs/models/cab.model';
import { Driver } from 'src/drivers/models/driver.model';
import { Organization } from 'src/organization/models/organization.model';
import { Security } from 'src/security/models/security.model';
import { PickDrop, Status, TripStatus } from 'src/shared/enums';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { TripActual } from './trip-actual.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { Alert } from 'src/alerts/models/alert.model';

interface Employee {
  id: string;
  empCode: string;
  name: string;
  location: string;
  address: string;
  landmark: string;
  homepoint: string;
  gender: string;
  tripRequestID: number;
  specialConsideration?: string;
  cabArrivalTime?: string;
  officeLocation?: string;
}

@Table({
  timestamps: true,
  paranoid: true,
})
export class Trip extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column(sequelize.BIGINT)
  id: bigint;

  @Column({ allowNull: true })
  routeNumber: string;

  @Column({ allowNull: true })
  vendorCode: string;

  @Column({ allowNull: true })
  seats: string;

  @BelongsTo(() => Vendor, {
    foreignKey: 'vendorID',
    as: 'vendor',
  })
  vendor: Vendor;

  @Column({
    type: DataType.JSONB, // Use JSONB for PostgreSQL (or JSON if using another DB)
    allowNull: true,
  })
  employees: Employee[];

  @Column({ allowNull: true })
  spock: boolean;

  @Column({ allowNull: true, defaultValue: false })
  toll: boolean;

  @Column({ allowNull: true })
  scheduledTime: string;

  @Column({ allowNull: true })
  plannedTime: string;

  @BelongsTo(() => Cab, {
    foreignKey: 'cabID',
    as: 'cab',
  })
  cab: Cab;

  @BelongsTo(() => Organization, {
    foreignKey: 'orgID',
    as: 'org',
  })
  org: Organization;

  //   @ForeignKey(() => Organization)
  //   @Column
  //   orgID: bigint;

  //   @BelongsTo(() => Organization, {
  //     foreignKey: 'orgID',
  //     as: 'org',
  //   })
  //   org: Organization;

  //   @ForeignKey(() => Driver)
  //   @Column
  //   driverID: bigint;

  //   @BelongsTo(() => Driver, {
  //     foreignKey: 'driverID',
  //     as: 'driver',
  //   })
  //   driver: Driver;

  @Column
  cabID: bigint;

  @Column
  orgID: bigint;

  @Column
  vendorID: bigint;

  @Column
  driverID: bigint;
  @BelongsTo(() => Driver, {
    foreignKey: 'driverID',
    as: 'driver',
  })
  driver: Driver;

  @Column
  spockID: bigint;
  @BelongsTo(() => Security, {
    foreignKey: 'spockID',
    as: 'security',
  })
  security: Security;

  // @Column
  // spockID: bigint;

  @Column({ allowNull: true })
  spockCode: string;

  @Column({ defaultValue: PickDrop.Pick, allowNull: true })
  pickDrop: PickDrop;

  @Column
  estimatedOccupancy: string;

  // @Column({ allowNull: true })
  // estimatedStartDateTime: string;

  // @Column({ allowNull: true })
  // estimatedEndDateTime: string;
  @Column({ type: DataType.DATE, allowNull: true })
  estimatedStartDateTime: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  estimatedEndDateTime: Date;

  @Column({ allowNull: true })
  estimatedDistance: string;

  @Column({ allowNull: true })
  estimatedCost: string;

  @Column({ allowNull: true })
  tripLocation: string;

  @Column({
    type: DataType.ENUM,
    values: [
      TripStatus.Pending,
      TripStatus.Confirmed,
      TripStatus.Ongoing,
      TripStatus.Completed,
      TripStatus.Cancelled,
    ],
    defaultValue: TripStatus.Pending,
  })
  status: string;

  @Column({ defaultValue: Status.Inactive, allowNull: true })
  lockStatus: Status;

  @Column({ allowNull: true })
  routeID: string;

  @Column({ allowNull: true })
  shiftTime: string;

  @Column({ allowNull: true })
  date: string;

  @HasOne(() => TripActual, { foreignKey: 'tripID', as: 'tripActual' })
  tripActual: TripActual;

  @Column({
    type: DataType.JSONB, // Use JSONB for PostgreSQL (or JSON if using another DB)
    allowNull: true,
  })
  routeLegs: [];

  @HasMany(() => TripRequest, {
    as: 'employeeTripRequest',
    foreignKey: 'tripID',
  })
  employeeTripRequest: TripRequest[];

  @HasMany(() => TripRequest, { as: 'tripEmployees', foreignKey: 'tripID' })
  tripEmployees: TripRequest[];

  @HasMany(() => Alert, { as: 'alert', foreignKey: 'tripID' })
  alert: Alert[];

  @Column({ allowNull: true })
  emergencyType: string;

  @Column({ allowNull: true })
  vehicleNumber: string;

  @Column({ allowNull: true })
  driverCode: string;

  @Column({ type: DataType.DATE, allowNull: true })
  acceptedAt: Date;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  routeCache: {
    actual?: {
      points: { lat: number; lng: number }[];
      waypointsHash: string;
      cachedAt: string; // ISO timestamp
    };
    planned?: {
      points: { lat: number; lng: number }[];
      waypointsHash: string;
      cachedAt: string;
    };
  };
}
