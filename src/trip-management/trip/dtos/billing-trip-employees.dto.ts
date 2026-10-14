import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// Same rationale as billing-trip-assignment.dto.ts: every id below lands in a
// `where` against a BIGINT column, and a non-numeric value reaches Postgres as
// "invalid input syntax for type bigint" - an error with no .status, which the
// service catch re-throws raw as a 500. @IsNumberString is not enough (it
// accepts "1.5", "-1", "+1", "1e3", all of which still blow up). Digits only.
const NUMERIC_ID = /^\d+$/;

// Trip.employees[].cabArrivalTime is a bare 'HH:mm' string, written that way by
// employee-est-time-calculation.service.ts:47,55,87,95 (dayjs .format('HH:mm')).
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Both TripRequest.attendanceTime and Trip.employees[].attendanceTime are
// written as 'YYYY-MM-DD HH:mm:ss' by this slice - see the note on
// BillingTripAttendanceDto.attendanceTime below.
const YYYY_MM_DD_HH_MM_SS =
  /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

// Trip.estimatedDistance is a plain string that every writer in the codebase
// formats as `${km} km` (trip.service.ts:2544, :2738, :5438, :2996).
const DISTANCE_KM = /^\d+(\.\d+)?\s*km$/i;

/**
 * Shared preamble for every billing-edit employee write.
 *
 * tripID + a mandatory reason. The reason is written into the EventLog
 * changeJSON so each edit is explainable from GET /admin/trip/:id/edit-history.
 */
export class BillingTripEmployeeBaseDto {
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'Trip ID is required' })
  @Matches(NUMERIC_ID, { message: 'Trip ID must be a numeric id' })
  tripID: string;

  // @IsNotEmpty alone passes a whitespace-only string, so the service trims and
  // re-checks before doing anything.
  //
  // @MaxLength is load-bearing, not cosmetic: on the add path the reason is
  // concatenated into TripRequest.remarks, which is VARCHAR(255)
  // (20241210034741-alter-table-trip-request.js:6-8). Without a cap, a long
  // reason overflows into a Postgres 22001 - an error with no .status, which the
  // service catch re-throws raw as an unexplained 500. 200 leaves room for the
  // "Added post-completion from billing edit: " prefix.
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'Reason is required' })
  @IsString({ message: 'Reason must be a string' })
  @MaxLength(200, { message: 'Reason must be 200 characters or fewer' })
  reason: string;
}

export class BillingTripEmployeeAddDto extends BillingTripEmployeeBaseDto {
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'Employee ID is required' })
  @Matches(NUMERIC_ID, { message: 'employeeID must be a numeric id' })
  employeeID: string;
}

export class BillingTripEmployeeRemoveDto extends BillingTripEmployeeBaseDto {
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'Employee ID is required' })
  @Matches(NUMERIC_ID, { message: 'employeeID must be a numeric id' })
  employeeID: string;
}

export class BillingTripEmployeeOrderDto extends BillingTripEmployeeBaseDto {
  // The full ordered list of ACTIVE employee ids. The service rejects anything
  // that is not an exact permutation of the trip's current active roster, so a
  // stale client array can never silently drop or duplicate an employee.
  @ApiProperty({ required: true, type: [String] })
  @IsArray({ message: 'employeeIDs must be an array' })
  @ArrayNotEmpty({ message: 'employeeIDs must not be empty' })
  @Matches(NUMERIC_ID, {
    each: true,
    message: 'each employee id must be numeric',
  })
  employeeIDs: string[];
}

export class BillingTripAttendanceDto extends BillingTripEmployeeBaseDto {
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'Employee ID is required' })
  @Matches(NUMERIC_ID, { message: 'employeeID must be a numeric id' })
  employeeID: string;

  // true  -> attendance: true,  noShow: false, attendanceMode: 'Manual'
  // false -> attendance: false, noShow: true,  attendanceMode: null
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'present is required' })
  @IsBoolean({ message: 'present must be a boolean' })
  present: boolean;

  // Optional override for the FE time-picker. When omitted the service defaults
  // to 5 minutes before the trip's end (TripActual.actualEndDate +
  // .actualEndTime); when the trip has no usable end time that default is a 400
  // rather than a silent moment() fallback, which would stamp today's date onto
  // a trip that ran months ago.
  //
  // Format is 'YYYY-MM-DD HH:mm:ss' for BOTH tables. That is deliberate and
  // differs from the driver OTP path (driver.trip.services.ts:575), which is
  // the only writer that puts a bare 'HH:mm:ss' into TripRequest.attendanceTime.
  // It is the odd one out: the admin path (trip-request.service.ts:636), the
  // mobile path (mob.trip-request.service.ts:249) and the self-no-show path
  // (trip-request.service.ts:5189) all write the full datetime, and the
  // employee-delay report parses this column with an explicit
  // 'YYYY-MM-DD HH:mm:ss' (trip-req-report-export.service.ts:1125-1128) - a
  // bare 'HH:mm:ss' yields an Invalid Date and a NaN delay.
  @ApiProperty({ required: false, example: '2026-03-10 21:55:00' })
  @IsOptional()
  @Matches(YYYY_MM_DD_HH_MM_SS, {
    message: 'attendanceTime must be in the format YYYY-MM-DD HH:mm:ss',
  })
  attendanceTime?: string;

  // Capped for the same reason as reason: TripRequests.attendanceLocation is
  // VARCHAR(255) (224-trip-request.js:113-116), and an overflow surfaces as an
  // unexplained 500 rather than a validation error.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'attendanceLocation must be 255 characters or fewer',
  })
  attendanceLocation?: string;
}

export class BillingTripCabArrivalDto extends BillingTripEmployeeBaseDto {
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'Employee ID is required' })
  @Matches(NUMERIC_ID, { message: 'employeeID must be a numeric id' })
  employeeID: string;

  @ApiProperty({ required: true, example: '21:45' })
  @IsNotEmpty({ message: 'cabArrivalTime is required' })
  @Matches(HH_MM, { message: 'cabArrivalTime must be in the format HH:mm' })
  cabArrivalTime: string;
}

export class BillingTripCabArrivedDto extends BillingTripEmployeeBaseDto {
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'Employee ID is required' })
  @Matches(NUMERIC_ID, { message: 'employeeID must be a numeric id' })
  employeeID: string;

  // TripRequest.cabArrivedAt is a full DATE column (not a bare time), and a
  // trip can cross midnight, so 'HH:mm' (BillingTripCabArrivalDto's format,
  // used for the ESTIMATED cabArrivalTime) would be ambiguous here. Reuses
  // the same YYYY_MM_DD_HH_MM_SS format/regex BillingTripAttendanceDto
  // already validates attendanceTime with, above.
  @ApiProperty({ required: true, example: '2026-03-10 21:58:00' })
  @IsNotEmpty({ message: 'cabArrivedAt is required' })
  @Matches(YYYY_MM_DD_HH_MM_SS, {
    message: 'cabArrivedAt must be in the format YYYY-MM-DD HH:mm:ss',
  })
  cabArrivedAt: string;
}

export class BillingTripEstimatedDistanceDto extends BillingTripEmployeeBaseDto {
  // Kept in the `<n> km` shape every other writer uses, so the billing report
  // and the trip views keep rendering it unchanged.
  @ApiProperty({ required: true, example: '24.5 km' })
  @IsNotEmpty({ message: 'estimatedDistance is required' })
  @Matches(DISTANCE_KM, {
    message: 'estimatedDistance must look like "24.5 km"',
  })
  estimatedDistance: string;
}
