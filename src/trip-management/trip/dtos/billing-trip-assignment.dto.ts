import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

// Every id below lands in a `where` clause against a BIGINT column. A
// non-numeric value reaches Postgres as "invalid input syntax for type bigint",
// an error with no .status, which the service catch re-throws raw as a 500.
//
// @IsNumberString is NOT sufficient: it delegates to validator.isNumeric, which
// accepts "1.5", "-1", "+1" and "1e3" - all of which still blow up against a
// BIGINT. Digits only.
const NUMERIC_ID = /^\d+$/;

export class BillingTripAssignmentDto {
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'Trip ID is required' })
  @Matches(NUMERIC_ID, { message: 'Trip ID must be a numeric id' })
  tripID: string;

  // Mandatory on every edit in this slice - it is written into the EventLog so
  // the change is explainable from the edit-history endpoint. @IsNotEmpty alone
  // passes a whitespace-only string, so the service trims and re-checks.
  @ApiProperty({ required: true })
  @IsNotEmpty({ message: 'Reason is required' })
  @IsString({ message: 'Reason must be a string' })
  reason: string;

  // vendorID, driverID and cabID move as a set - supplying vendorID without the
  // other two is rejected in the service (cross-field, so not expressible here).
  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(NUMERIC_ID, { message: 'vendorID must be a numeric id' })
  vendorID?: string;

  // Accepted so a client that echoes it back does not get a 400, but the value
  // is IGNORED: vendorCode is re-derived from Vendor.code server-side so it can
  // never diverge from vendorID.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vendorCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(NUMERIC_ID, { message: 'driverID must be a numeric id' })
  driverID?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(NUMERIC_ID, { message: 'cabID must be a numeric id' })
  cabID?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  spock?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(NUMERIC_ID, { message: 'spockID must be a numeric id' })
  spockID?: string;

  // NOTE: there is deliberately no spockCode field. It is derived from
  // Security.securityCode for the supplied spockID, so the stored code can
  // never point at a different person than spockID does.
}
