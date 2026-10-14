import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import * as moment from 'moment';
import { ReportScheduler } from '../models/report-scheduler.model';
import { EmailService } from 'src/email/email.service';
import { TripReportService } from 'src/reports/services/trip-report.service';
import * as ExcelJS from 'exceljs';
import { TripRequestReportService } from 'src/reports/services/trip-request-report.service';
import { SortOrder } from 'src/shared/enums';
import { EmployeeReportService } from 'src/reports/services/employee-report.service';
import { AlertReportService } from 'src/reports/services/alert-report.service';
import { TripBillingReportService } from 'src/billing-module/services/trip-report.service';
import { GrievanceService } from 'src/grievance/services/grievance.service';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { DriverOverspeedReportService } from 'src/reports/services/driver-overspeed-report.service';

@Injectable()
export class CronReportSchedulerService {
  private readonly logger = new Logger(CronReportSchedulerService.name);

  constructor(
    @InjectModel(ReportScheduler)
    private readonly reportSchedulerModel: typeof ReportScheduler,
    private readonly emailService: EmailService,
    private readonly tripReportService: TripReportService,
    private readonly tripRequestReportService: TripRequestReportService,
    private readonly employeeReportService: EmployeeReportService,
    private readonly alertReportService: AlertReportService,
    private readonly tripBillingReportService: TripBillingReportService,
    private readonly grievanceService: GrievanceService,
    private readonly eventLogService: EventLogService,
    private readonly driverOverspeedReportService: DriverOverspeedReportService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleReportSchedulerCron() {
    this.logger.log('----- Running Report Scheduler Cron----');
    const currentDay = moment().format('ddd'); // Mon
    const currentCronTime = moment().format('HH:mm');
    const schedulers = await this.reportSchedulerModel.findAll({
      where: {
        status: 'Active',
        frequency: {
          [Op.contains]: [currentDay],
        },
      },
    });
    if (!schedulers.length) {
      this.logger.log('No reports scheduled for this hour');
      return;
    }

    for (const scheduler of schedulers) {
      try {
        if (!scheduler.time?.includes(currentCronTime)) {
          this.logger.log(
            ` scheduler ${scheduler.id}, time ${currentCronTime} not configured`,
          );
          continue;
        }
        this.logger.log(
          `Processing scheduler ID ${scheduler.id} (${scheduler.reportName})`,
        );
        const reportData = await this.generateReport(
          scheduler,
          // currentCronTime,
        );
        if (!reportData?.items?.length) {
          this.logger.warn(`No data found for report ${scheduler.reportName}`);
        }
        const excelBuffer = await this.convertToExcel(
          reportData?.items || [],
          scheduler.reportName,
        );
        await this.emailService.sendEmail({
          mailTo: scheduler.recipients,
          subject: `Scheduled Report - ${scheduler.reportName}`,
          templateName: 'scheduled-reports',
          isAttachments: true,
          attachments: [
            {
              filename: `${scheduler.reportName}_${moment().format(
                'DD-MM-YYYY',
              )}.xlsx`,
              content: excelBuffer,
            },
          ],
          mailBody: {
            reportName: scheduler.reportName,
            date: moment().format('DD-MM-YYYY'),
          },
        });
        this.logger.log(
          `-- Report sent: ${
            scheduler.reportName
          } → ${scheduler.recipients.join(', ')}--`,
        );
      } catch (error: any) {
        this.logger.error(
          `----Failed scheduler ${scheduler.id}----`,
          error?.message,
        );
      }
    }
  }

  private async generateReport(
    scheduler: ReportScheduler,
    // cronTime?: string,
  ): Promise<any> {
    const userContext = { orgID: scheduler.orgID };
    const { startDate, endDate } = this.getDateRangeFromCronTime(
      // cronTime,
      scheduler.dateRangeType,
      scheduler.dateRangeValue,
    );
    const params = {
      filters: {
        dateRange: {
          startDate,
          endDate,
        },
      },
      skip: 0,
      take: 9999999,
      sortBy: 'date',
      sortOrder: 'DESC',
    };
    const employeeFilter = {
      filters: {
        dateRange: {
          startDate,
          endDate,
        },
      },
      skip: 0,
      take: 9999999,
      sortBy: 'id',
      sortOrder: 'DESC',
    };
    const panicFilter = {
      filters: {
        dateRange: {
          startDate,
          endDate,
        },
      },
      skip: 0,
      take: 9999999,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    };
    const commonFilter = {
      startDate: startDate,
      endDate: endDate,
      skip: 0,
      take: 9999999,
      sortBy: 'date',
      sortOrder: SortOrder.DESC,
    };
    const empNoShowFilter = {
      employeeCode: scheduler.employeeCode
        ? { label: scheduler.employeeCode }
        : undefined,
      startDate: startDate,
      endDate: endDate,
      skip: 0,
      take: 9999999,
      sortBy: 'date',
      sortOrder: SortOrder.DESC,
    };

    switch (scheduler.reportName) {
      case 'OTA Report':
        return this.tripReportService.getOTAReport(params, userContext);
      case 'OTD Report':
        return this.tripReportService.getOTDReport(params, userContext);
      case 'Trips Report':
        return this.tripReportService.findAllReports(commonFilter, userContext);
      case 'TR Report':
        return this.tripRequestReportService.findAllReports(
          commonFilter,
          userContext,
        );
      case 'No show Report':
        return this.tripRequestReportService.getNoshowReport(
          params,
          userContext,
        );
      case 'Employee No show Report':
        return this.tripRequestReportService.getEmployeeNoshowReport(
          empNoShowFilter,
          userContext,
        );
      case 'Escort Report':
        return this.tripReportService.getEscortReport(params, userContext);
      case 'Ad/Med Report':
        return this.tripRequestReportService.findAllAdHocMedicalReports(
          params,
          userContext,
        );
      case 'Cancelled Report':
        return this.tripRequestReportService.findAllCancelledReports(
          params,
          userContext,
        );
      case 'Employee Report':
        return this.employeeReportService.getNewEmployeeReport(
          employeeFilter,
          userContext,
        );
      case 'Attrition Report':
        return this.employeeReportService.getEmployeeAttritionReport(
          employeeFilter,
          userContext,
        );
      case 'Panic Report':
        return this.alertReportService.getPanicReport(panicFilter, userContext);
      case 'Employee Trip Rating Report':
        return this.tripRequestReportService.getTripRatingReport(
          params,
          userContext,
        );
      case 'Trip Billing Report':
        return this.tripBillingReportService.findAll(commonFilter, userContext);
      case 'Cab Arrival Time Report':
        return this.tripRequestReportService.getCabArrivalTimeReport(
          employeeFilter,
          userContext,
        );
      case 'Grievance Report':
        return this.grievanceService.exportGrievances(
          { dateRange: { startDate, endDate } },
          { orgID: scheduler.orgID, name: 'System' }, // no real "currentUser" in cron context
        );
      case 'Event Logs Report':
        return this.eventLogService.exportEventLogs(
          { orgID: scheduler.orgID, userType: 'SuperAdmin' }, // bypasses org/authID scoping per earlier decision
          { startDate, endDate },
        );
      case 'Overspeed Report':
        return this.driverOverspeedReportService.findAllReports(
          commonFilter,
          userContext,
        );
      default:
        this.logger.warn(`Unknown reportName: ${scheduler.reportName}`);
        return null;
    }
  }

  private getDateRangeFromCronTime(
    // cronTime: string,
    dateRangeType: string,
    dateRangeValue: number,
  ) {
    // const end = moment(
    //   `${moment().format('YYYY-MM-DD')} ${cronTime}`,
    //   'YYYY-MM-DD HH:mm',
    // );
    let end = moment();
    let start = moment(end);

    switch (dateRangeType) {
      case 'Days':
        if (dateRangeValue) {
          // start = start.subtract(dateRangeValue, 'days');
          start = start.subtract(dateRangeValue, 'days').startOf('day');
          end = moment().subtract(1, 'days').startOf('day');
        } else {
          start = start.clone().startOf('day');
          end.endOf('day');
        }
        break;

      case 'Weeks':
        if (dateRangeValue) {
          // start = start.subtract(dateRangeValue, 'weeks');
          start = start.subtract(dateRangeValue, 'weeks').startOf('isoWeek');
          end = moment().subtract(1, 'weeks').endOf('isoWeek');
        } else {
          start = start.clone().startOf('isoWeek'); // Monday
          end.endOf('isoWeek'); // Sunday
        }
        break;
      case 'Months':
        if (dateRangeValue) {
          // start = start.subtract(dateRangeValue, 'months');
          start = start.subtract(dateRangeValue, 'months').startOf('month');
          end = moment().subtract(1, 'weeks').endOf('month');
        } else {
          start = start.clone().startOf('month');
          end.endOf('month');
        }
        break;
      case 'Years':
        if (dateRangeValue) {
          // start = start.subtract(dateRangeValue, 'years');
          start = start.subtract(dateRangeValue, 'years').startOf('year');
          end = moment().subtract(1, 'weeks').endOf('year');
        } else {
          start = start.clone().startOf('year');
          end.endOf('year');
        }
        break;
      default:
        throw new Error(`Invalid dateRangeType`);
    }
    return {
      startDate: start.format('YYYY-MM-DD'),
      endDate: end.format('YYYY-MM-DD'),
    };
  }

  private TRIP_OTA_OTD_COLUMNS = [
    { key: 'date', header: 'Date' },
    { key: 'routeNumber', header: 'Route No' },
    { key: 'cab.regNo', header: 'Cab Reg No' },
    { key: 'cab.model', header: 'Cab Model' },
    { key: 'driver.name', header: 'Driver Name' },
    { key: 'vendor.name', header: 'Vendor Name' },
    { key: 'vendorCode', header: 'Vendor Code' },
    { key: 'firstEmpCabArrivalTime', header: 'Pickup Time' },
    { key: 'firstEmpCabArrivedAt', header: 'Cab Reach Time' },
    { key: 'firstEmpAttendanceTime', header: 'Actual Boarding Time' },
    { key: 'pickDrop', header: 'Pick Drop' },
    { key: 'shiftTime', header: 'Shift Time' },
    { key: 'tripActual.actualEndTime', header: 'Act End Time' },
    { key: 'estimatedStartDateTime', header: 'Est Start' },
    { key: 'tripActual.actualStartDate', header: 'Act Start Date' },
    { key: 'tripActual.actualStartTime', header: 'Actl Start Time' },
    { key: 'estimatedEndDateTime', header: 'Est End Date Time' },
    { key: 'tripActual.actualEndDate', header: 'Actl End Date' },
    { key: 'estimatedDistance', header: 'Est Distance' },
    { key: 'tripActual.actualDistance', header: 'Actl Distance' },
    { key: 'estimatedOccupancy', header: 'Est Occupancy' },
    { key: 'tripActual.actualOccupancy', header: 'Actl Occupancy' },
    { key: 'estimatedCost', header: 'Estl Cost' },
    { key: 'tripActual.actualCost', header: 'Actl Cost' },
    { key: 'seats', header: 'Seats' },
    { key: 'tripLocation', header: 'Trip Location' },
    { key: 'lockStatus', header: 'Lock Status' },
    { key: 'status', header: 'Status' },
  ];

  private TRIPS_REPORT_COLUMNS = [
    { key: 'id', header: 'Trip ID' },
    { key: 'routeNumber', header: 'Route Number' },
    { key: 'vendorCode', header: 'Vendor Code' },
    { key: 'seats', header: 'Seats' },
    { key: 'spock', header: 'Security' },
    { key: 'cabID', header: 'Cab ID' },
    { key: 'pickDrop', header: 'Pick/Drop' },
    { key: 'tripLocation', header: 'Location' },
    { key: 'status', header: 'Status' },
    { key: 'lockStatus', header: 'Lock Status' },
    { key: 'shiftTime', header: 'Shift Time' },
    { key: 'date', header: 'Date' },
    { key: 'tripActual.actualStartTime', header: 'Actual Start Time' },
    { key: 'tripActual.actualEndTime', header: 'Actual End Time' },
    { key: 'tripActual.actualDistance', header: 'Actual Distance' },
    { key: 'tripActual.actualCost', header: 'Actual Cost' },
    { key: 'employees.length', header: 'Employees' },
    { key: 'estimatedDistance', header: 'Estimated Distance' },
    { key: 'estimatedOccupancy', header: 'Estimated Occupancy' },
    { key: 'employees.0.name', header: 'Employee Name' },
    { key: 'employees.0.empCode', header: 'Employee Code' },
    { key: 'employees.0.gender', header: 'Employee Gender' },
    { key: 'employees.0.address', header: 'Employee Address' },
    { key: 'employees.0.landmark', header: 'Employee Landmark' },
    { key: 'employees.0.location', header: 'Employee Location' },
    { key: 'employees.0.homepoint', header: 'Employee Home Point' },
    { key: 'employees.0.noShow', header: 'Employee No Show' },
    { key: 'employees.0.commuteDistance', header: 'Commute Distance' },
    { key: 'vendor.name', header: 'Vendor Name' },
    { key: 'cab.regNo', header: 'Cab Registration' },
    { key: 'cab.noOfSeats', header: 'Cab Seats' },
    { key: 'cab.color', header: 'Cab Color' },
    { key: 'cab.fuelType', header: 'Cab Fuel Type' },
    { key: 'driver.name', header: 'Driver Name' },
    { key: 'driver.phone', header: 'Driver Phone' },
    { key: 'driver.licenseNo', header: 'Driver License' },
    { key: 'driver.licenseExpiry', header: 'License Expiry' },
    { key: 'security.name', header: 'Security Name' },
    { key: 'security.phone1', header: 'Security Phone' },
    { key: 'security.securityCode', header: 'Security Code' },
  ];

  private TR_REPORT_COLUMNS = [
    { key: 'employee.employeeCode', header: 'Employee Code' },
    { key: 'date', header: 'Date' },
    { key: 'shiftTime', header: 'Shift Time' },
    { key: 'pickDrop', header: 'Pick/Drop' },
    { key: 'status', header: 'Status' },
    { key: 'attendance', header: 'Attendance' },
    { key: 'noShow', header: 'No Show' },
    { key: 'locationName', header: 'Location Name' },
    { key: 'employee.name', header: 'Employee Name' },
    { key: 'employee.phone', header: 'Employee Phone' },
    { key: 'employee.email', header: 'Employee Email' },
    { key: 'employee.address', header: 'Employee Address' },
    { key: 'employee.landmark', header: 'Employee Landmark' },
    { key: 'employee.homePoint', header: 'Employee Home Point' },
    { key: 'employee.gender', header: 'Employee Gender' },
    { key: 'employee.team.name', header: 'Team' },
    { key: 'employee.process.name', header: 'Process' },
    { key: 'trip.routeNumber', header: 'Route Number' },
    { key: 'trip.status', header: 'Trip Status' },
    { key: 'trip.vendorCode', header: 'Vendor Code' },
    { key: 'trip.seats', header: 'Seats' },
    { key: 'trip.shiftTime', header: 'Trip Shift Time' },
    { key: 'trip.pickDrop', header: 'Trip Pick/Drop' },
    { key: 'location.name', header: 'Location' },
    { key: 'location.geoCode', header: 'Location GeoCode' },
  ];

  private NO_SHOW_REPORT_COLUMNS = [
    { key: 'employee.name', header: 'Employee Name' },
    { key: 'employeeCode', header: 'Employee Code' },
    { key: 'employee.gender', header: 'Gender' },
    { key: 'employee.designation', header: 'Designation' },
    { key: 'trip.date', header: 'Date' },
    { key: 'trip.id', header: 'Trip ID' },
    { key: 'trip.routeNumber', header: 'Route No' },
    { key: 'trip.pickDrop', header: 'Pick Drop' },
    { key: 'trip.shiftTime', header: 'Shift Time' },
    { key: 'trip.tripLocation', header: 'Trip Location' },
    { key: 'noShow', header: 'NoShow Status' },
    { key: 'reportReason', header: 'Reason' },
    { key: 'attendanceTime', header: 'Marked Time' },
    { key: 'attendanceLocation', header: 'Marked Location' },
    { key: 'trip.vendor.name', header: 'Vendor' },
    { key: 'trip.cab.regNo', header: 'Cab' },
    { key: 'employee.process.name', header: 'Process Name' },
    { key: 'employee.team.name', header: 'Team Name' },
    { key: 'employee.costcenter.name', header: 'Costcenter Name' },
    { key: 'employee.reportingID', header: 'Reporting Person ID' },
  ];

  private ESCORT_REPORT_COLUMNS = [
    { key: 'routeNumber', header: 'Route No' },
    { key: 'date', header: 'Date' },
    { key: 'shiftTime', header: 'Shift Time' },
    { key: 'security.name', header: 'Name' },
    { key: 'security.securityCode', header: 'Security Code' },
    { key: 'security.gender', header: 'Gender' },
    { key: 'security.address', header: 'Address' },
    { key: 'security.phone1', header: 'Phone' },
    { key: 'pickDrop', header: 'Pick Drop' },
    { key: 'tripLocation', header: 'Trip Location' },
  ];

  private ADHOC_MED_CANCELLED_REPORT_COLUMNS = [
    { key: 'employeeCode', header: 'Employee Code' },
    { key: 'date', header: 'Date' },
    { key: 'pickDrop', header: 'Pick/Drop' },
    { key: 'shiftTime', header: 'Shift Time' },
    { key: 'emergencyType', header: 'Emergency Type' },
    { key: 'status', header: 'Status' },
    { key: 'locationName', header: 'Location Name' },
    { key: 'employee.name', header: 'Employee Name' },
    { key: 'employee.phone', header: 'Employee Phone' },
    { key: 'employee.email', header: 'Employee Email' },
    { key: 'employee.address', header: 'Employee Address' },
    { key: 'employee.landmark', header: 'Employee Landmark' },
    { key: 'employee.homePoint', header: 'Employee Home Point' },
    { key: 'location.geoCode', header: 'Location GeoCode' },
    { key: 'team.name', header: 'Team Name' },
    { key: 'process.name', header: 'Process Name' },
  ];

  private EMPLOYEE_REPORT_COLUMNS = [
    { key: 'name', header: 'Employee Name' },
    { key: 'employeeCode', header: 'Employee Code' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'gender', header: 'Gender' },
    { key: 'designation', header: 'Designation' },
    { key: 'joinedDate', header: 'Joined Date' },
    { key: 'landmark', header: 'Landmark' },
    { key: 'status', header: 'Status' },
  ];

  private ATTRITION_REPORT_COLUMNS = [
    { key: 'name', header: 'Employee Name' },
    { key: 'employeeCode', header: 'Employee Code' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'gender', header: 'Gender' },
    { key: 'designation', header: 'Designation' },
    { key: 'exitDate', header: 'Exit Date' },
    { key: 'exitStatus', header: 'Exit Status' },
  ];

  private PANIC_REPORT_COLUMNS = [
    { key: 'employee.name', header: 'Employee Name' },
    { key: 'driver.name', header: 'Driver Name' },
    { key: 'remarks', header: 'Remarks' },
    { key: 'acknowledgedAt', header: 'Ack Date (Time)' },
    { key: 'comments', header: 'Comments' },
    { key: 'type', header: 'Type' },
    { key: 'location', header: 'Location' },
    { key: 'tripID', header: 'Trip ID' },
    { key: 'status', header: 'Status' },
    { key: 'createdAt', header: 'Alert Date (Time)' },
  ];

  private EMPLOYEE_TRIP_RATING_COLUMNS = [
    { key: 'employee.name', header: 'Employee Name' },
    { key: 'employeeCode', header: 'Employee Code' },
    { key: 'employee.gender', header: 'Gender' },
    { key: 'employee.designation', header: 'Designation' },
    { key: 'trip.pickDrop', header: 'Pick Drop' },
    { key: 'trip.vendorCode', header: 'Vendor Code' },
    { key: 'trip.date', header: 'Date' },
    { key: 'trip.routeNumber', header: 'Route No' },
    { key: 'trip.driver.name', header: 'Driver' },
    { key: 'tripID', header: 'Trip ID' },
    { key: 'ratings', header: 'Ratings' },
    { key: 'comments', header: 'Comments' },
  ];

  private CAB_ARRIVAL_TIME_COLUMNS = [
    { key: 'employee.name', header: 'Employee Name' },
    { key: 'employeeCode', header: 'Employee Code' },
    { key: 'employee.gender', header: 'Gender' },
    { key: 'employee.designation', header: 'Designation' },
    { key: 'trip.pickDrop', header: 'Pick Drop' },
    { key: 'trip.vendorCode', header: 'Vendor Code' },
    { key: 'trip.date', header: 'Date' },
    { key: 'trip.routeNumber', header: 'Route No' },
    { key: 'trip.driver.name', header: 'Driver' },
    { key: 'tripID', header: 'Trip ID' },
    { key: 'cabWaitingTime', header: 'Waiting Time' },
    { key: 'attendanceTime', header: 'Debord At' },
    { key: 'cabArrivedAt', header: 'Cab Arrived At' },
    { key: 'pickUpTime', header: 'Pickup Time' },
    { key: 'dropTime', header: 'Drop Time' },
    { key: 'driverStatus', header: 'Driver Arrived' },
    { key: 'employeeStatus', header: 'Employee Arrived' },
  ];

  private TRIP_BILLING_REPORT_COLUMNS = [
    { key: 'id', header: 'Trip ID' },
    { key: 'cab.regNo', header: 'Cab Registration No' },
    { key: 'vendorCode', header: 'Vendor Code' },
    { key: 'seats', header: 'Seats' },
    { key: 'pickDrop', header: 'Pick/Drop' },
    { key: 'tripActual.billingRate.billingPlan', header: 'Billing Plan' },
    { key: 'tripActual.actualCost', header: 'Actual Cost' },
    { key: 'tripActual.actualDistance', header: 'Actual Distance' },
    { key: 'date', header: 'Date' },
    { key: 'shiftTime', header: 'Shift Time' },
    { key: 'status', header: 'Status' },
  ];

  private GRIEVANCE_REPORT_COLUMNS = [
    { key: 'createdAt', header: 'Submitted Date' },
    { key: 'grievanceId', header: 'Grievance Id' },
    { key: 'createdBy.name', header: 'Created By' },
    { key: 'category.name', header: 'Category' },
    { key: 'description', header: 'Description' },
    { key: 'status', header: 'Status' },
  ];

  private EVENT_LOGS_REPORT_COLUMNS = [
    { key: 'createdAt', header: 'Date' },
    { key: 'description', header: 'Description' },
    { key: 'objectType', header: 'Module' },
    { key: 'changeType', header: 'Action' },
    { key: 'updatedBy', header: 'Updated By' },
  ];

  private OVERSPEED_REPORT_COLUMNS = [
    { key: 'date', header: 'Date' },
    { key: 'time', header: 'Time' },
    { key: 'tripID', header: 'Trip ID' },
    { key: 'driverCode', header: 'Driver Code' },
    { key: 'driverName', header: 'Driver Name' },
    { key: 'routeNumber', header: 'Route Number' },
    { key: 'vendorCode', header: 'Vendor Code' },
    { key: 'cabRegNo', header: 'Cab Reg No' },
    { key: 'pickDrop', header: 'Pick/Drop' },
    { key: 'lockStatus', header: 'Lock Status' },
    { key: 'estimatedDistance', header: 'Estimated Distance' },
    { key: 'estimatedOccupancy', header: 'Estimated Occupancy' },
    { key: 'employeeBoardedCount', header: 'Employees Boarded' },
    { key: 'location', header: 'Location' },
    { key: 'currentSpeed', header: 'Current Speed' },
    { key: 'speedLimit', header: 'Speed Limit' },
    { key: 'shiftTime', header: 'Shift Time' },
    { key: 'empCodes', header: 'Employee Codes' },
  ];

  private getReportColumns(reportName: string) {
    switch (reportName) {
      case 'OTD Report':
        return this.TRIP_OTA_OTD_COLUMNS;
      case 'OTA Report':
        return this.TRIP_OTA_OTD_COLUMNS;
      case 'Trips Report':
        return this.TRIPS_REPORT_COLUMNS;
      case 'TR Report':
        return this.TR_REPORT_COLUMNS;
      case 'No show Report':
        return this.NO_SHOW_REPORT_COLUMNS;
      case 'Employee No show Report':
        return this.NO_SHOW_REPORT_COLUMNS;
      case 'Escort Report':
        return this.ESCORT_REPORT_COLUMNS;
      case 'Ad/Med Report':
        return this.ADHOC_MED_CANCELLED_REPORT_COLUMNS;
      case 'Cancelled Report':
        return this.ADHOC_MED_CANCELLED_REPORT_COLUMNS;
      case 'Employee Report':
        return this.EMPLOYEE_REPORT_COLUMNS;
      case 'Attrition Report':
        return this.ATTRITION_REPORT_COLUMNS;
      case 'Panic Report':
        return this.PANIC_REPORT_COLUMNS;
      case 'Employee Trip Rating Report':
        return this.EMPLOYEE_TRIP_RATING_COLUMNS;
      case 'Trip Billing Report':
        return this.TRIP_BILLING_REPORT_COLUMNS;
      case 'Cab Arrival Time Report':
        return this.CAB_ARRIVAL_TIME_COLUMNS;
      case 'Grievance Report':
        return this.GRIEVANCE_REPORT_COLUMNS;
      case 'Event Logs Report':
        return this.EVENT_LOGS_REPORT_COLUMNS;
      default:
        return null;
    }
  }

  private getValueByPath(obj: any, path: string) {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
  }

  private async convertToExcel(
    data: any[],
    reportName: string,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    if (!data.length) return Buffer.from([]);

    const columns = this.getReportColumns(reportName);
    if (!columns) {
      this.logger.warn(`No column config found for ${reportName}`);
      return Buffer.from([]);
    }
    // Set Excel headers
    worksheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: 22,
    }));

    // Add rows
    data.forEach((item) => {
      const plain = item.get ? item.get({ plain: true }) : item;
      const row: Record<string, any> = {};
      columns.forEach((col) => {
        let value = this.getValueByPath(plain, col.key);
        if (
          col.key === 'spock' ||
          col.key === 'employees.0.noShow' ||
          col.key === 'noShow'
        ) {
          value = value ? 'Yes' : 'No';
        }
        if (col.key === 'empCodes' && Array.isArray(value)) {
          value = value.join(', ');
        }
        if (
          (col.key === 'date' ||
            col.key === 'trip.date' ||
            col.key === 'joinedDate' ||
            col.key === 'exitDate') &&
          value
        ) {
          value = moment(value).format('DD-MM-YYYY');
        }
        if (
          (col.key === 'createdAt' ||
            col.key === 'acknowledgedAt' ||
            col.key === 'cabArrivedAt') &&
          value
        ) {
          // For Grievance/Event Logs, createdAt is a submission/event timestamp — keep date+time for Event Logs, date-only for Grievance
          value =
            reportName === 'Grievance Report'
              ? moment(value).format('DD-MM-YYYY')
              : moment(value).format('DD-MM-YYYY HH:mm');
        }
        row[col.key] = value ?? '-';
      });
      worksheet.addRow(row);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
