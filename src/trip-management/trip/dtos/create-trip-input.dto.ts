import { ApiProperty } from 'node_modules/@nestjs/swagger';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PickDrop, Status } from 'src/shared/enums';

class Employee {
  @ApiProperty()
  id: string;

  @ApiProperty()
  empCode: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  location: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  landmark: string;

  @ApiProperty()
  homePoint: string;

  @ApiProperty()
  homepoint: string;

  @ApiProperty()
  commuteDistance: string;

  @ApiProperty()
  gender: string;

  @ApiProperty()
  tripRequestID: string;

  @ApiProperty()
  employee: any;

  @ApiProperty()
  noShow: boolean;
  attendance: boolean;
  deboard: boolean;

  @ApiProperty({ required: false }) // ← Add this line
  specialConsideration?: string; // ← Add this line

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  officeLocation: string;
}

export class CreateTripInput {
  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  routeNumber: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  vendorCode: string | null;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  vendorID: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  seats: string | null;

  @ApiProperty({ required: true, type: [Employee] })
  @IsOptional()
  @IsArray()
  //   @ValidateNested({ each: true })  // Ensure each item in the array is validated as an instance of Employee
  employees: Employee[] | null;

  @ApiProperty({ required: false })
  @IsOptional()
  spock: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  toll: boolean;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  scheduledTime: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  plannedTime: string | null;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  cabID?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  orgID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  driverID?: string;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  spockID?: bigint;

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  @IsString()
  spockCode?: string;

  @ApiProperty({
    required: false,
    enum: PickDrop,
    default: PickDrop.Pick,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(PickDrop)
  pickDrop?: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  estimatedOccupancy: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  estimatedStartDateTime: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  estimatedEndDateTime: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  estimatedDistance: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  estimatedCost: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  actualOccupancy: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  actualStartDateTime: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  actualEndDateTime: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  actualDistance: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  actualCost: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  tripLocation: string | null;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  status?: string;

  @ApiProperty({
    required: false,
    enum: Status,
    default: Status.Active,
  })
  @IsOptional()
  @IsDefined()
  @IsEnum(Status)
  lockStatus?: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  routeID: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  shiftTime: string | null;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsString()
  date: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyType: string | null;
}
