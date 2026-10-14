import { Injectable, Logger } from '@nestjs/common';
import * as dayjs from 'dayjs';
import { InjectModel } from '@nestjs/sequelize';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { QueryTypes } from 'sequelize';

@Injectable()
export class EmployeeEstTimeCalculationService {
  // logger: any;
  private logger = new Logger(EmployeeEstTimeCalculationService.name);

  constructor(
    //     // @InjectModel(Employee) private employeeModel: typeof Employee,
    //     // private eventlogService: EventLogService,
    @InjectModel(TripRequest)
    private tripRequestModel: typeof TripRequest,
  ) {}

  async calculateEmployeeEstTime(
    pickDrop: string,
    shiftTime: string,
    employeeLegs: any,
    employees: any,
    arrivalTimeBuffer: string,
    dropTimeBuffer: string,
    cabWaitingTimeBuffer: string,
  ): Promise<any> {
    // console.log("Emp EST Time Calc: arrivalTimeBuffer: ",arrivalTimeBuffer);
    // console.log("Emp EST Time Calc: dropTimeBuffer: ",dropTimeBuffer);
    if (pickDrop == 'Pick') {
      const employeeCount = employees.length;
      const waitingTime = Number(cabWaitingTimeBuffer); // from config
      const totalWaitingTime = employeeCount * waitingTime;
      const cabDropTime = dayjs(`2023-01-01 ${shiftTime}`).subtract(
        Number(arrivalTimeBuffer) + totalWaitingTime,
        'minute',
      );
      employees.reverse();
      employeeLegs?.reverse();
      // Error: 'await' can only be used inside an async function or at the top level of a module
      // The map() callback function needs to be marked as async to use await
      await Promise.all(
        employees.map(async (employee: any, index) => {
          const parsedDuration = this.parseDurationString(
            employeeLegs?.[index]?.duration,
          );
          if (index === 0) {
            employee.cabArrivalTime = cabDropTime
              .subtract(parsedDuration, 'minute')
              .format('HH:mm');
          } else {
            const previousEmployee = employees[index - 1];
            const previousCabArrivalTime = dayjs(
              `2000-01-01T${previousEmployee.cabArrivalTime}`,
            );
            employee.cabArrivalTime = previousCabArrivalTime
              .subtract(parsedDuration, 'minute')
              .format('HH:mm');
          }
          try {
            await this.tripRequestModel.update(
              {
                pickUpTime: employee.cabArrivalTime,
              },
              {
                where: { id: employee?.tripRequestID },
                returning: true,
              },
            );
          } catch (error) {
            this.logger.log('Error in update trip request', error);
          }
        }),
      );
      const formattedEmployeeWithEstTime = employees.reverse();
      return formattedEmployeeWithEstTime;
    } else {
      const cabStart = dayjs(`2023-01-01 ${shiftTime}`).add(
        Number(dropTimeBuffer),
        'minute',
      );
      await Promise.all(
        employees.map(async (employee: any, index) => {
          const parsedDuration = this.parseDurationString(
            employeeLegs[index]?.duration,
          );
          if (index === 0) {
            employee.cabArrivalTime = cabStart
              .add(parsedDuration, 'minute')
              .format('HH:mm');
          } else {
            const previousEmployee = employees[index - 1];
            const previousCabArrivalTime = dayjs(
              `2000-01-01T${previousEmployee.cabArrivalTime}`,
            );
            employee.cabArrivalTime = previousCabArrivalTime
              .add(parsedDuration, 'minute')
              .format('HH:mm');
          }
          try {
            await this.tripRequestModel.update(
              {
                dropTime: employee.cabArrivalTime,
              },
              {
                where: { id: employee?.tripRequestID },
                returning: true,
              },
            );
          } catch (error) {
            this.logger.log('Error in update trip request', error);
          }
        }),
      );
      const formattedEmployeeWithEstTime = employees;
      return formattedEmployeeWithEstTime;
    }
  }

  parseDurationString(duration: string): number {
    if (!duration) return 0;
    // remove the string and convert to minutes
    const hourMatch = duration.match(/(\d+)\s*hour/);
    const minMatch = duration.match(/(\d+)\s*min/);

    const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
    const minutes = minMatch ? parseInt(minMatch[1]) : 0;

    return hours * 60 + minutes;
  }

  addMinutes(time: string, minutesToAdd: number): string {
    return dayjs(`2000-01-01T${time}`)
      .add(minutesToAdd, 'minute')
      .format('HH:mm');
  }

  getTotalDurationInMinutes(
    legs: { duration: string }[],
    extraDurations: string[] = [],
  ): number {
    const legsDuration = legs.reduce((total, leg) => {
      return total + this.parseDurationString(leg.duration);
    }, 0);

    const extraMinutes = extraDurations.reduce((total, d) => {
      return total + this.parseDurationString(d);
    }, 0);

    return legsDuration + extraMinutes;
  }

  formatMinutes(minutes: number): string {
    // Convert minutes to H:M format eg :  2 hours 47 minutes
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    const hourStr = hours > 0 ? `${hours} hour${hours !== 1 ? 's' : ''}` : '';
    const minStr = mins > 0 ? `${mins} minute${mins !== 1 ? 's' : ''}` : '';

    return [hourStr, minStr].filter(Boolean).join(' ');
  }

  //new code for calculating est time for all employees in one go instead of one by one
  async calculateEmployeeEstTimeNew(
    pickDrop: string,
    shiftTime: string,
    employeeLegs: any,
    employees: any,
    arrivalTimeBuffer: string,
    dropTimeBuffer: string,
    cabWaitingTimeBuffer: string,
  ): Promise<any> {
    // console.log("Emp EST Time Calc: arrivalTimeBuffer: ",arrivalTimeBuffer);
    // console.log("Emp EST Time Calc: dropTimeBuffer: ",dropTimeBuffer);
    if (pickDrop == 'Pick') {
      const employeeCount = employees.length;
      const waitingTime = Number(cabWaitingTimeBuffer); // from config
      const totalWaitingTime = employeeCount * waitingTime;
      const cabDropTime = dayjs(`2023-01-01 ${shiftTime}`).subtract(
        Number(arrivalTimeBuffer) + totalWaitingTime,
        'minute',
      );
      employees.reverse();
      employeeLegs?.reverse();
      // Error: 'await' can only be used inside an async function or at the top level of a module
      // The map() callback function needs to be marked as async to use await
      await Promise.all(
        employees.map(async (employee: any, index) => {
          const parsedDuration = this.parseDurationString(
            employeeLegs?.[index]?.duration,
          );
          if (index === 0) {
            employee.cabArrivalTime = cabDropTime
              .subtract(parsedDuration, 'minute')
              .format('HH:mm');
          } else {
            const previousEmployee = employees[index - 1];
            const previousCabArrivalTime = dayjs(
              `2000-01-01T${previousEmployee.cabArrivalTime}`,
            );
            employee.cabArrivalTime = previousCabArrivalTime
              .subtract(parsedDuration, 'minute')
              .format('HH:mm');
          }
        }),
      );
      // One statement for the whole trip instead of one per employee - see
      // persistEstTimes. Wrapped so a write failure still logs and the method
      // still returns its computed array, exactly as the old per-employee
      // catch did.
      try {
        await this.persistEstTimes('pickUpTime', employees);
      } catch (error) {
        this.logger.log('Error in update trip request', error);
      }
      const formattedEmployeeWithEstTime = employees.reverse();
      return formattedEmployeeWithEstTime;
    } else {
      const cabStart = dayjs(`2023-01-01 ${shiftTime}`).add(
        Number(dropTimeBuffer),
        'minute',
      );
      await Promise.all(
        employees.map(async (employee: any, index) => {
          const parsedDuration = this.parseDurationString(
            employeeLegs[index]?.duration,
          );
          if (index === 0) {
            employee.cabArrivalTime = cabStart
              .add(parsedDuration, 'minute')
              .format('HH:mm');
          } else {
            const previousEmployee = employees[index - 1];
            const previousCabArrivalTime = dayjs(
              `2000-01-01T${previousEmployee.cabArrivalTime}`,
            );
            employee.cabArrivalTime = previousCabArrivalTime
              .add(parsedDuration, 'minute')
              .format('HH:mm');
          }
        }),
      );
      // One statement for the whole trip instead of one per employee - see
      // persistEstTimes. Wrapped so a write failure still logs and the method
      // still returns its computed array, exactly as the old per-employee
      // catch did.
      try {
        await this.persistEstTimes('dropTime', employees);
      } catch (error) {
        this.logger.log('Error in update trip request', error);
      }
      const formattedEmployeeWithEstTime = employees;
      return formattedEmployeeWithEstTime;
    }
  }

  private async persistEstTimes(
    column: 'pickUpTime' | 'dropTime',
    employees: any[],
  ): Promise<void> {
    // Keyed by id so a duplicate tripRequestID inside one employees[] keeps
    // the LAST occurrence - that is what the old sequence of single-row
    // updates left in the row, and UPDATE ... FROM with a duplicate join row
    // would otherwise apply an arbitrary one. Falsy ids are dropped rather
    // than sent: the old code passed where: { id: undefined }, which
    // Sequelize rejects outright and the per-employee catch swallowed.
    const byId = new Map<string, string>();
    for (const employee of employees ?? []) {
      if (!employee?.tripRequestID || !employee?.cabArrivalTime) continue;
      byId.set(String(employee.tripRequestID), employee.cabArrivalTime);
    }
    if (byId.size === 0) return;

    // Sequelize expands an array of arrays into ('1', '08:30'), ('2', '09:00')
    // (sql-string.js arrayToList) - the VALUES list shape used by
    // trip-request-group.service.ts:110-137.
    const tuples = [...byId.entries()];

    // v.id::bigint because "TripRequests"."id" is BIGINT while the VALUES
    // literals arrive as strings (pg returns bigint as a string, and the ids
    // in employees[] came from there).
    await this.tripRequestModel.sequelize.query(
      `UPDATE "TripRequests" AS tr
          SET "${column}" = v.est, "updatedAt" = now()
         FROM (VALUES :tuples) AS v(id, est)
        WHERE tr."id" = v.id::bigint
          AND tr."deletedAt" IS NULL`,
      {
        replacements: { tuples },
        type: QueryTypes.UPDATE,
      },
    );
  }
}
