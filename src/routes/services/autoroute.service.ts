import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Route } from '../models/route.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { TripRequestService } from 'src/trip-management/trip-request/services/trip-request.service';
import * as dayjs from 'dayjs';
import { TripService } from 'src/trip-management/trip/services/trip.service';
import { normalizeTimeFormat } from 'src/shared/utils/timeUtils';
import { parseCommuteTimeToMinutes } from 'src/shared/utils/commuteTimeUtils';
import { Location } from 'src/location-management/locations/models/location.model';

@Injectable()
export class AutoRouteService {
  logger: any;
  // sequelize: any;

  constructor(
    @InjectModel(Route) private routeModel: typeof Route,
    @InjectModel(Location) private locationModel: typeof Location,
    private eventlogService: EventLogService,
    private configService: ConfigurationService,
    private tripRequestService: TripRequestService,
    private tripService: TripService,
  ) {}

  async autoTripRouteGeneration(
    shiftTime: string,
    date: string,
    pickDrop: boolean,
    cabCountData: any,
    configData: any,
    user: any,
    requestType?: any,
  ): Promise<any> {
    const routes = await this.routeModel.findAll({
      where: { orgID: user.orgID },
      attributes: ['id', 'name', 'zoneIDs'],
    });

    // Get zone trip times
    const zoneIds = routes.flatMap((route) => route.zoneIDs);
    const locations = await this.locationModel.findAll({
      where: { id: zoneIds, orgID: user.orgID },
      attributes: ['id', 'tripTime'],
    });

    const zoneToTripTime = new Map<number, number>();
    locations.forEach((location) => {
      zoneToTripTime.set(Number(location.id), Number(location.tripTime));
    });
    routes.forEach((route) => {
      route.zoneIDs = pickDrop ? route.zoneIDs : [...route.zoneIDs].reverse();
    });

    const tripRequests =
      await this.tripRequestService.findAllTripRequestsByShiftTime(
        user,
        date,
        shiftTime,
        pickDrop,
        requestType,
      );

    const zoneToRequests = new Map<number, any[]>();
    tripRequests.items.forEach((request) => {
      const zoneID = Number(request?.employee?.locationID);
      if (!zoneToRequests.has(zoneID)) {
        zoneToRequests.set(zoneID, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      zoneToRequests.get(zoneID)!.push(request);
    });

    //Group requests route and zonewise
    const tripArray = routes.map((route) => {
      let employeesForRoute: any[] = [];

      route.zoneIDs.forEach((zoneID) => {
        const requestsForZone = zoneToRequests.get(zoneID) || [];
        employeesForRoute = employeesForRoute.concat(requestsForZone);
        zoneToRequests.set(zoneID, []);
      });

      employeesForRoute.sort((a, b) => {
        if (a.locationID === b.locationID) {
          return pickDrop
            ? a.employee.sortOrder - b.employee.sortOrder
            : b.employee.sortOrder - a.employee.sortOrder;
        }
        return 0;
      });

      return {
        routeID: route.id,
        routeName: route.name,
        employees: employeesForRoute,
      };
    });

    //Group requests by zoneID - If zone is not assigned to route, create a new unmapped zone route for that zone
    for (const [zoneID, requests] of zoneToRequests.entries()) {
      const filteredRequests = requests.filter((request) => request.locationID); // remove null or undefined locationIDs from requests
      if (filteredRequests.length === 0) continue;

      const sortedRequests = filteredRequests.sort((a, b) => {
        if (a.locationID !== b.locationID) {
          return a.locationID - b.locationID;
        }
        return pickDrop
          ? a.employee.sortOrder - b.employee.sortOrder
          : b.employee.sortOrder - a.employee.sortOrder;
      });

      tripArray.push({
        routeID: null,
        routeName: `Zone not assigned to route - ${zoneID}`,
        employees: sortedRequests,
      });
    }

    const seatNumbers = await this.configService.getConfigValue(
      'CAB_SEATERS',
      user.orgID,
    );

    const isNightShift = await this.isShiftWithinNightHours(shiftTime, user);

    const seatNumbersArray =
      typeof seatNumbers === 'string'
        ? seatNumbers
            .split(',')
            .map((seat) => Number(seat.split(':')[1]?.trim()))
            .filter((num) => !isNaN(num))
        : Array.isArray(seatNumbers)
        ? seatNumbers
        : [4, 6];

    seatNumbersArray.sort((a, b) => a - b);
    const spokeArray = {
      name: 'Spock',
      gender: 'male',
      location: 'Spock',
      address: 'Spock',
      landmark: 'Spock',
      employee: {
        id: '38180',
        name: 'Spock',
        gender: 'Male',
        phone: '9823654125',
        homePoint: '9.979,76.4728',
        landmark: 'Spock',
        address: 'Spock',
        locationID: '481',
        sortOrder: '1',
      },
    };
    const copyAllAssignedCabs = [];
    let tripWithSpokeArray;
    let routeNumber = 1;
    const cabUsageTracker: Record<number, number> = {};

    while (tripArray.length > 0) {
      const trip = tripArray.shift();
      if (!trip) continue;

      const employees = [...trip.employees];
      const assignedCabSizes = this.assignCabs(
        employees.length,
        seatNumbersArray,
        cabCountData,
        cabUsageTracker,
      );

      assignedCabSizes.forEach((seats) => {
        const routeZones = trip.routeID
          ? routes.find((r) => r.id === trip.routeID)?.zoneIDs || []
          : [Number(employees[0]?.employee?.locationID)];

        const cabEmployees = this.assignEmployeesToCabWithTimeValidation(
          employees,
          seats,
          routeZones,
          zoneToTripTime,
        );
        let spockAdded = false;

        if (cabEmployees.length === 0) return;

        if (isNightShift && pickDrop === false) {
          // Check if last employee is female F
          let lastEmp = cabEmployees[cabEmployees.length - 1];
          let lastIsFemale =
            lastEmp?.employee?.gender?.toLowerCase() === 'female';

          // If cab has only one employee and that employee is female, add spock
          if (cabEmployees.length === 1 && lastIsFemale) {
            cabEmployees.push({ ...spokeArray });
            spockAdded = true;
          } else if (lastIsFemale && cabEmployees.length + 1 > seats) {
            // If female and no space for spock, remove her from this cab
            const movedEmployee = cabEmployees.pop();
            employees.unshift(movedEmployee); // add back to employee list for next cab

            // Recheck new last
            lastEmp = cabEmployees[cabEmployees.length - 1];
            lastIsFemale =
              lastEmp?.employee?.gender?.toLowerCase() === 'female';
          }

          // Add spock if last employee is female and only one spock per cab
          if (
            lastIsFemale &&
            !(cabEmployees.length === 1 && spockAdded === false)
          ) {
            cabEmployees.push({ ...spokeArray });
            spockAdded = true;
          }
        }

        if (isNightShift && pickDrop === true) {
          // Check if first employee is female
          let firstEmp = cabEmployees[0];
          let firstIsFemale =
            firstEmp?.employee?.gender?.toLowerCase() === 'female';

          // If cab has only one employee and that employee is female, add spock
          if (cabEmployees.length === 1 && firstIsFemale) {
            cabEmployees.push({ ...spokeArray });
            spockAdded = true;
          } else if (firstIsFemale && cabEmployees.length + 1 > seats) {
            // Not enough space for spock, move last employee to next cab
            const movedEmployee = cabEmployees.pop();
            employees.unshift(movedEmployee); // preserve order for next cab

            // Recheck if first employee is still female after removal
            firstEmp = cabEmployees[0];
            firstIsFemale =
              firstEmp?.employee?.gender?.toLowerCase() === 'female';
          }

          // Add spock if first employee is female and cab is not just one female already handled
          if (
            firstIsFemale &&
            !(cabEmployees.length === 1 && spockAdded === false)
          ) {
            cabEmployees.push({ ...spokeArray });
            spockAdded = true;
          }
        }

        copyAllAssignedCabs.push({
          routeID: trip.routeID,
          routeName: trip.routeName,
          routeNumber: routeNumber++,
          seats: seats,
          employees: cabEmployees,
          pickDrop: pickDrop ? 'Pick' : 'Drop',
          shiftTime: shiftTime,
          date: date,
          spock: spockAdded,
        });
      });

      // Assign remaining employees to a new cab if any are left
      while (employees.length > 0) {
        const remainingSeats = this.assignCabs(
          employees.length,
          seatNumbersArray,
          cabCountData,
          cabUsageTracker,
        );

        remainingSeats.forEach((seats) => {
          const routeZones = trip.routeID
            ? routes.find((r) => r.id === trip.routeID)?.zoneIDs || []
            : [Number(employees[0]?.employee?.locationID)];

          const cabEmployees = this.assignEmployeesToCabWithTimeValidation(
            employees,
            seats,
            routeZones,
            zoneToTripTime,
          );
          let spockAdded = false;

          if (isNightShift) {
            // If cab has only one employee and that employee is female, add spock
            if (cabEmployees.length === 1) {
              const singleEmp = cabEmployees[0];
              if (singleEmp?.employee?.gender?.toLowerCase() === 'female') {
                cabEmployees.push({ ...spokeArray });
                spockAdded = true;
              }
            }
          }

          copyAllAssignedCabs.push({
            routeID: trip.routeID,
            routeName: trip.routeName,
            routeNumber: routeNumber++,
            seats: seats,
            employees: cabEmployees,
            pickDrop: pickDrop ? 'Pick' : 'Drop',
            shiftTime: shiftTime,
            date: date,
            spock: spockAdded,
          });
        });
      }
    }

    copyAllAssignedCabs.forEach((trip) => {
      trip.employees = trip.employees.filter(
        (employee: { name?: string }) =>
          employee.name?.toLowerCase() !== 'spock',
      );
    });

    await this.configService.updateNoOfCabsConfig(configData, user);

    // Total real employees across every generated cab, computed after the
    // spock-placeholder filter above so it reflects actual routed
    // employees only, not the synthetic Spock filler row some cabs get.
    const totalEmployeesRouted = copyAllAssignedCabs.reduce(
      (sum, trip) => sum + trip.employees.length,
      0,
    );

    const eventPayload = {
      shiftTime,
      date,
      pickDrop,
      cabCountData,
      configData,
    };

    // payload was previously the raw copyAllAssignedCabs array — since
    // changeType is 'add' (no changeJSON), that fell through to
    // DetailTable's payloadJSON branch, which does Object.entries() on
    // it; iterating an array gives index keys ("0", "1", ...) with no
    // .label on the values, so every row rendered blank. Flat scalar
    // summary instead, matching every other creation log in this codebase.
    const eventLog = {
      objectType: 'Trip Auto Route',
      changeType: 'add',
      objectID: null,
      authID: user.id,
      orgID: user?.orgID,
      updatedBy: user.name,
      payload: {
        date,
        shiftTime,
        pickDrop: pickDrop ? 'Pick' : 'Drop',
        routesCreated: copyAllAssignedCabs.length,
        employeesRouted: totalEmployeesRouted,
      },
      requestPayload: eventPayload,
      user,
    };
    await this.eventlogService.create(eventLog);
    return {
      items: copyAllAssignedCabs,
      tripArray: tripWithSpokeArray,
    };
  }

  /**
   * Assigns employees to cab based on zone time constraints
   */
  private assignEmployeesToCabWithTimeValidation(
    employees: any[],
    maxSeats: number,
    routeZones: number[],
    zoneToTripTime: Map<number, number>,
  ): any[] {
    const assignedEmployees: any[] = [];

    // Process employees zone by zone according to route order
    for (const zoneId of routeZones) {
      const zoneEmployees = employees.filter(
        (emp) => Number(emp?.employee?.locationID) === zoneId,
      );

      const zoneTripTime = zoneToTripTime.get(zoneId) || Infinity;
      let currentZoneTime = 0;

      for (const employee of zoneEmployees) {
        const commuteTimeMinutes = parseCommuteTimeToMinutes(
          employee?.employee?.commuteTime || '0 mins',
        );

        // Check if adding this employee would exceed zone time limit or cab capacity
        if (
          currentZoneTime + commuteTimeMinutes <= zoneTripTime &&
          assignedEmployees.length < maxSeats
        ) {
          assignedEmployees.push(employee);
          currentZoneTime += commuteTimeMinutes;

          // Remove assigned employee from the original array
          const index = employees.indexOf(employee);
          if (index > -1) {
            employees.splice(index, 1);
          }
        }
      }
    }

    // Prevent infinite loop: assign at least one employee if none were assigned
    if (assignedEmployees.length === 0 && employees.length > 0) {
      const firstEmployee = employees.shift();
      if (firstEmployee) {
        assignedEmployees.push(firstEmployee);
      }
    }

    return assignedEmployees;
  }

  private assignCabs(
    employeesCount: number,
    seatNumbersArray: number[],
    cabCountData: any,
    usageTracker: Record<number, number> = {},
  ): number[] {
    const sortedSeats = [...seatNumbersArray].sort((a, b) => a - b);
    const assignedCabs: number[] = [];

    const cabAvailability: Record<number, number> = {};
    cabCountData.forEach((cab) => {
      const seat = Number(cab.availableSeats);
      cabAvailability[seat] = Number(cab.count);
    });

    const canUseSeat = (seat: number) => {
      const used = usageTracker[seat] || 0;
      return used < (cabAvailability[seat] || 0);
    };

    if (employeesCount <= 0) return assignedCabs;

    for (const seat of sortedSeats) {
      if (seat === employeesCount && canUseSeat(seat)) {
        usageTracker[seat] = (usageTracker[seat] || 0) + 1;
        assignedCabs.push(seat);
        return assignedCabs;
      }
    }

    for (const seat of sortedSeats) {
      if (seat > employeesCount && canUseSeat(seat)) {
        const vacant = seat - employeesCount;

        if (vacant >= 3 && employeesCount > 3) {
          const first = Math.ceil(employeesCount / 2);
          const second = employeesCount - first;

          const firstCab = this.findBestCab(
            first,
            sortedSeats,
            cabAvailability,
            usageTracker,
          );
          const secondCab = this.findBestCab(
            second,
            sortedSeats,
            cabAvailability,
            usageTracker,
          );

          if (firstCab && secondCab && firstCab + secondCab <= seat) {
            assignedCabs.push(
              ...this.assignCabs(
                first,
                seatNumbersArray,
                cabCountData,
                usageTracker,
              ),
            );
            assignedCabs.push(
              ...this.assignCabs(
                second,
                seatNumbersArray,
                cabCountData,
                usageTracker,
              ),
            );
            return assignedCabs;
          }
        }

        usageTracker[seat] = (usageTracker[seat] || 0) + 1;
        assignedCabs.push(seat);
        return assignedCabs;
      }
    }

    for (let i = sortedSeats.length - 1; i >= 0; i--) {
      const seat = sortedSeats[i];
      if (seat <= employeesCount && canUseSeat(seat)) {
        usageTracker[seat] = (usageTracker[seat] || 0) + 1;
        assignedCabs.push(seat);
        const remaining = employeesCount - seat;
        if (remaining > 0) {
          assignedCabs.push(
            ...this.assignCabs(
              remaining,
              seatNumbersArray,
              cabCountData,
              usageTracker,
            ),
          );
        }
        return assignedCabs;
      }
    }

    const smallest = sortedSeats[0];
    if (canUseSeat(smallest)) {
      usageTracker[smallest] = (usageTracker[smallest] || 0) + 1;
      assignedCabs.push(smallest);
      const remaining = employeesCount - smallest;
      if (remaining > 0) {
        assignedCabs.push(
          ...this.assignCabs(
            remaining,
            seatNumbersArray,
            cabCountData,
            usageTracker,
          ),
        );
      }
    }

    return assignedCabs;
  }

  private findBestCab(
    employees: number,
    sortedSeats: number[],
    cabAvailability: Record<number, number>,
    usageTracker: Record<number, number>,
  ): number {
    for (const seat of sortedSeats) {
      if (
        seat === employees &&
        (usageTracker[seat] || 0) < (cabAvailability[seat] || 0)
      ) {
        return seat;
      }
    }

    for (const seat of sortedSeats) {
      if (
        seat > employees &&
        (usageTracker[seat] || 0) < (cabAvailability[seat] || 0)
      ) {
        return seat;
      }
    }

    for (let i = sortedSeats.length - 1; i >= 0; i--) {
      const seat = sortedSeats[i];
      if (
        seat <= employees &&
        (usageTracker[seat] || 0) < (cabAvailability[seat] || 0)
      ) {
        return seat;
      }
    }

    return 0;
  }

  async isShiftWithinNightHours(
    shiftTimeStr: string,
    user: any,
  ): Promise<boolean> {
    // const nightShiftStart = await this.configService.getConfigValue(
    //   'NIGHT_SHIFT_START_TIME',
    //   user.orgID,
    // );

    // const nightShiftEnd = await this.configService.getConfigValue(
    //   'NIGHT_SHIFT_END_TIME',
    //   user.orgID,
    // );
    const configValues = await this.configService.getMultipleConfigValues(
      ['Night shift start time', 'Night shift end time'],
      { orgID: user.orgID },
    );
    // console.log('RAW configValues:', JSON.stringify(configValues, null, 2));
    const nightShiftStart = configValues?.data?.['Night shift start time'];
    const nightShiftEnd = configValues?.data?.['Night shift end time'];

    const nightStart = dayjs(
      dayjs().format('YYYY-MM-DD') + ' ' + nightShiftStart,
      'YYYY-MM-DD H:mm',
    );
    let nightEnd = dayjs(
      dayjs().format('YYYY-MM-DD') + ' ' + nightShiftEnd,
      'YYYY-MM-DD H:mm',
    );
    let shiftTime = dayjs(
      dayjs().format('YYYY-MM-DD') + ' ' + shiftTimeStr,
      'YYYY-MM-DD H:mm',
    );

    // Handle shift crossing midnight
    if (nightEnd.isBefore(nightStart)) {
      nightEnd = nightEnd.add(1, 'day');
    }

    // If shift time is before start, it might be on next day
    if (shiftTime.isBefore(nightStart)) {
      shiftTime = shiftTime.add(1, 'day');
    }

    return (
      shiftTime.isSame(nightStart) ||
      shiftTime.isSame(nightEnd) ||
      (shiftTime.isAfter(nightStart) && shiftTime.isBefore(nightEnd))
    );
  }

  async copyRouteToNewtrip(
    shiftTime: string,
    date: string,
    copyShiftTime: string,
    copyDate: string,
    pickDrop: boolean,
    requestType: any,
    user: any,
  ): Promise<any> {
    const normalizedShiftTime = normalizeTimeFormat(shiftTime);
    const normalizedCopyShiftTime = normalizeTimeFormat(copyShiftTime);

    const tripRequests =
      await this.tripRequestService.findAllTripRequestsByShiftTime(
        user,
        date,
        normalizedShiftTime,
        pickDrop,
        requestType,
      );
    //      console.log("📋 COPY ROUTE - Current date trip requests (unassigned employees):", {
    //   totalCount: tripRequests?.totalItems,
    //   sampleData: tripRequests?.items?.slice(0, 3), // First 3 items
    //   allEmployeeCodes: tripRequests?.items?.map(req => req.empCode)
    // });

    const trips = await this.tripService.findAllTripsListByDate(
      normalizedCopyShiftTime,
      copyDate,
      user,
      pickDrop,
    );
    //   console.log('trips  >>>   ', trips.items);
    //    console.log("🚌 COPY ROUTE - Trips from copy date:", {
    //   totalTrips: trips?.totalItems,
    //   sampleTrip: trips?.items?.[0], // First trip complete structure
    //   allRouteNumbers: trips?.items?.map(trip => trip.routeNumber)
    // });

    const filteredTrips = await this.filterEmployeesInTrips(
      trips.items,
      tripRequests.items,
    );
    //    console.log("🔍 COPY ROUTE - Filtered trips (after employee matching):", {
    //   totalFilteredTrips: filteredTrips?.length,
    //   sampleFilteredTrip: filteredTrips?.[0],
    //   employeeCountPerTrip: filteredTrips?.map(trip => ({
    //     routeNumber: trip.routeNumber,
    //     employeeCount: trip.employees?.length,
    //     employeeCodes: trip.employees?.map(emp => emp.empCode)
    //   }))
    // });

    const transformedData = await this.transformTripsData(
      filteredTrips,
      date,
      normalizedShiftTime,
    );
    // transformedData.forEach((element) => {
    //   console.log('element.employees  >>>   ', element);
    // });
    // Update this existing console log
    // console.log("✨ COPY ROUTE - Final transformed data:", {
    //   totalTransformedTrips: transformedData?.length,
    //   sampleTransformedTrip: transformedData?.[0],
    //   // 🆕 ADD THIS - Show vendor/cab/driver info
    //   vendorCabDriverInfo: transformedData?.map(trip => ({
    //     routeNumber: trip.routeNumber,
    //     vendorID: trip.vendorID,
    //     vendorCode: trip.vendorCode,
    //     cabID: trip.cabID,
    //     driverID: trip.driverID,
    //     employeeCount: trip.employees?.length
    //   })),
    //   summary: transformedData?.map(trip => ({
    //     routeNumber: trip.routeNumber,
    //     date: trip.date,
    //     shiftTime: trip.shiftTime,
    //     employeeCount: trip.employees?.length
    //   }))
    // });
    return transformedData;
  }

  // async filterEmployeesInTrips(trips, tripRequests) {
  //   // First, create a deep copy to break circular references
  //   // This creates new objects without circular references
  //   const tripsClone = JSON.parse(
  //     JSON.stringify(trips, await this.getCircularReplacer()),
  //   );
  //   const requestsClone = JSON.parse(
  //     JSON.stringify(tripRequests, await this.getCircularReplacer()),
  //   );

  //   // Extract valid employee IDs from trip requests
  //   const validEmployeeIds = requestsClone.map((request) => request.id);

  //   // Filter each trip to include only employees with valid IDs
  //   const filteredTrips = tripsClone.map((trip) => {
  //     // Create a copy of the trip to avoid modifying the original
  //     const filteredTrip = { ...trip };

  //     // Filter the employees array
  //     filteredTrip.employees = trip.employees.filter((employee) =>
  //       validEmployeeIds.includes(employee.id),
  //     );

  //     // Update estimated occupancy to match the filtered employee count
  //     filteredTrip.estimatedOccupancy = String(filteredTrip.employees.length);

  //     return filteredTrip;
  //   });

  //   // Remove trips with no employees
  //   const nonEmptyTrips = filteredTrips.filter(
  //     (trip) => trip.employees.length > 0,
  //   );

  //   return nonEmptyTrips;
  // }
  async filterEmployeesInTrips(trips, tripRequests) {
    const tripsClone = JSON.parse(JSON.stringify(trips));
    const requestsClone = JSON.parse(JSON.stringify(tripRequests));
    //    console.log("🔄 FILTER EMPLOYEES - Input data:", {
    //   originalTripsCount: tripsClone.length,
    //   requestsCount: requestsClone.length,
    //   sampleOriginalTrip: tripsClone[0],
    //   allRequestEmployeeCodes: requestsClone.map(req => req.empCode)
    // });

    // Create a map: employeeId => newTripRequestID
    const employeeIdToRequestId = new Map(
      requestsClone.map((req) => [
        req.employee?.id ?? req.id,
        req.tripRequestID,
      ]),
    );

    //    console.log("🗺️ FILTER EMPLOYEES - Employee ID to Request ID mapping:",
    //   Array.from(employeeIdToRequestId.entries())
    // );

    // Filter and update employees in trips
    const updatedTrips = tripsClone.map((trip) => {
      const updatedEmployees = trip.employees
        .filter((emp) => employeeIdToRequestId.has(emp.id))
        .map((emp) => ({
          ...emp,
          tripRequestID: employeeIdToRequestId.get(emp.id),
        }));

      return {
        ...trip,
        employees: updatedEmployees,
        estimatedOccupancy: String(updatedEmployees.length),
      };
    });
    //    console.log("📊 FILTER EMPLOYEES - Before and after filtering:", {
    //   beforeFiltering: tripsClone.map(trip => ({
    //     routeNumber: trip.routeNumber,
    //     originalEmployeeCount: trip.employees?.length,
    //     originalEmployees: trip.employees?.map(emp => emp.empCode)
    //   })),
    //   afterFiltering: updatedTrips.map(trip => ({
    //     routeNumber: trip.routeNumber,
    //     filteredEmployeeCount: trip.employees?.length,
    //     filteredEmployees: trip.employees?.map(emp => emp.empCode)
    //   }))
    // });

    // Remove trips with no employees
    const finalTrips = updatedTrips.filter((trip) => trip.employees.length > 0);

    // ADD THIS CONSOLE
    // console.log("🎯 FILTER EMPLOYEES - Final result:", {
    //   tripsWithEmployees: finalTrips.length,
    //   tripsRemoved: updatedTrips.length - finalTrips.length
    // });

    return finalTrips;
  }

  async getCircularReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
      // Skip parent, include, and other properties that might cause circular references
      if (key === 'parent' || key === 'include') {
        return undefined; // exclude this property
      }

      // Handle other circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return undefined; // exclude this value
        }
        seen.add(value);
      }
      return value;
    };
  }

  async safeStringify(obj) {
    return JSON.stringify(obj, await this.getCircularReplacer(), 2);
  }

  async processData(trips, tripRequests) {
    try {
      // Filter trips to include only valid employees and remove empty trips
      const filteredTrips = this.filterEmployeesInTrips(trips, tripRequests);

      // Return the filtered data
      return filteredTrips;
    } catch (error) {
      // console.error('Error processing data:', error.message);
      return [];
    }
  }

  async transformTripsData(
    rawDataArray: any[],
    date: string,
    shiftTime: string,
  ): Promise<any> {
    return rawDataArray.map((rawData) => {
      // 🔍 ADD THIS CONSOLE LOG - Verify vendor/cab/driver data

      const transformedTrip = {
        date: date,
        routeName: rawData.routeName,
        routeNumber: rawData.routeNumber,
        seats: rawData.seats,
        shiftTime: shiftTime,
        pickDrop: rawData.pickDrop,
        spock: rawData.spock,
        toll: rawData.toll,

        // 🆕 Copy vendor/cab/driver assignments
        vendorID: rawData.vendorID,
        vendorCode: rawData.vendorCode,
        cabID: rawData.cabID,
        driverID: rawData.driverID,
        spockID: rawData.spockID,
        spockCode: rawData.spockCode,

        employees: rawData.employees.map((employee: any) => {
          return {
            tripRequestID: employee.tripRequestID,
            id: employee.id,
            empCode: employee.empCode,
            name: employee.name,
            gender: employee.gender,
            address: employee.address,
            landmark: employee.landmark,
            location: employee.location,
            locationID: employee.locationID,
            homePoint: employee.homepoint,
            commuteDistance: employee.commuteDistance,
            phone: employee.phone,
            noShow: employee.noShow,
            pickUpTime: employee.pickUpTime ?? null,
          };
        }),
      };

      // 🔍 Log the final transformed trip structure

      return transformedTrip;
    });
  }
}
