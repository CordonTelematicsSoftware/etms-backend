import { Employee } from 'src/employee/models/employee.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';

export interface RouteWithZones {
  id: bigint;
  name: string;
  zoneIDs: number[];
}

export interface TripRequestWithZone {
  id: bigint;
  locationID: string;
  pickUpTime: string;
  tripRequestID: bigint;
  tripID: bigint;
  empCode: string;
  name: string;
  gender: string;
  location: string;
  address: string;
  landmark: string;
  employee: Employee;
  // ... other fields as needed
}

export interface CabGroup {
  seats: number;
  requests: TripRequestWithZone[];
}

export interface RouteOutput {
  routeId: bigint;
  routeName: string;
  zoneIDs: number[];
  requestCount: number;
  cabs: {
    fourSeater: CabGroup[];
    sixSeater: CabGroup[];
  };
}

export interface Cab {
  capacity: 4 | 6;
  requests: TripRequest[];
  totalPassengers: number;
}

export interface RouteAssignment {
  routeId?: bigint;
  routeName?: string;
  zoneIDs?: number[];
  requestCount?: number;
  seats?: number;
  requests?: TripRequestWithZone[];
  routeNumber?: number;
  cabs?: {
    fourSeater: Cab[];
    sixSeater: Cab[];
  };
}
