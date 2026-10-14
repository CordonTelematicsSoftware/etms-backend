import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, literal } from 'sequelize';
import * as moment from 'moment-timezone';
import { Employee } from 'src/employee/models/employee.model';
import { SafeHomeIVRHistory } from 'src/IVR-calling/models/safeHomeIVRHistory.model';
// import { Alert } from 'src/alert/models/alert.model';
import { Alert } from 'src/alerts/models/alert.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { SAFE_HOME_STATUS } from 'src/shared/enums';
import { PaginatedList } from 'src/shared/interfaces/generic-response';

@Injectable()
export class SafeHomeReportService {
  private logger = new Logger(SafeHomeReportService.name);

  constructor(
    @InjectModel(TripRequest)
    private readonly tripRequestModel: typeof TripRequest,
    @InjectModel(SafeHomeIVRHistory)
    private readonly safeHomeIVRHistoryModel: typeof SafeHomeIVRHistory,
    @InjectModel(Alert)
    private readonly alertModel: typeof Alert,
  ) {}

  /**
   * One row per trip request, not per call. A single deboard can produce two
   * history rows (first call missed, second answered) and they must collapse
   * into one line; a PIN confirmation produces none at all and must still
   * appear. That is why TripRequests is the base and the history is joined in
   * afterwards rather than driven from SafeHomeIVRHistories.
   */
  async getSafeHomeReport(
    reportFilterInput: any,
    user: any,
  ): Promise<PaginatedList<any>> {
    try {
      const orgID = user?.orgID;
      const filters = reportFilterInput?.filters || {};

      const rows = await this.buildRows(orgID, filters);

      // Night shift and status are both derived, so paging has to happen after
      // they are applied — otherwise the count is wrong and pages have holes.
      const skip = Number(reportFilterInput?.skip) || 0;
      const take = Number(reportFilterInput?.take) || rows.length;

      // totalItems is the pre-slice count, so the caller can page correctly.
      // skip is a page index here, not a row offset — that is what every other
      // report service and the shared FE grid assume.
      return {
        totalItems: rows.length,
        items: rows.slice(skip * take, skip * take + take),
      };
    } catch (error: any) {
      this.logger.error(`getSafeHomeReport failed: ${error?.message}`);
      throw error;
    }
  }

  /**
   * Same rows as the report, unpaginated, for the Excel export. The export
   * envelope key is `exportFilters`, not `filters` — that is what every other
   * *-report-export service reads and what the FE export modal posts.
   */
  async getSafeHomeReportForExport(
    exportFilters: any,
    user: any,
  ): Promise<any[]> {
    return this.buildRows(user?.orgID, exportFilters?.exportFilters || {});
  }

  private async buildRows(orgID: bigint, filters: any): Promise<any[]> {
    const where: any = {
      orgID,
      deboard: true,
      // A trip request belongs in this report when a safe-home check actually
      // happened to it, not when the employee's gender currently matches a config
      // value. Gender eligibility is now per-org configurable, so a gender-based
      // filter would retroactively add or hide historical rows every time an org
      // changed the setting.
      [Op.or]: [
        // PIN confirmation writes safeHome without ever creating a call row.
        { safeHome: { [Op.ne]: null } },
        // SafeHomeIVRHistory is paranoid, so the soft-delete scope has to be
        // applied by hand inside a raw subquery. Keeping it under Op.in (rather
        // than a bare literal) lets Sequelize alias-qualify `id` as
        // "TripRequest"."id", which matters because this query has includes.
        {
          id: {
            [Op.in]: literal(
              `(SELECT "tripRequestID" FROM "SafeHomeIVRHistories"
                  WHERE "callType" = 'SAFE_HOME'
                    AND "tripRequestID" IS NOT NULL
                    AND "deletedAt" IS NULL)`,
            ),
          },
        },
      ],
    };

    if (filters?.dateRange?.startDate && filters?.dateRange?.endDate) {
      where.date = {
        [Op.between]: [filters.dateRange.startDate, filters.dateRange.endDate],
      };
    }
    if (filters?.empCode?.length) {
      where.employeeCode = { [Op.in]: filters.empCode };
    }
    if (filters?.pickDrop !== undefined && filters?.pickDrop !== null) {
      where.pickDrop = filters.pickDrop;
    }

    // Optional so a soft-deleted employee does not drop a row that has real
    // safe-home evidence behind it.
    const employeeInclude: any = {
      model: Employee,
      as: 'employee',
      required: false,
      attributes: ['id', 'name', 'employeeCode', 'phone', 'gender'],
    };

    // Only narrow when the caller asked. Employee.gender is nullable and Op.in
    // drops NULLs, so passing the full enum "to mean everyone" would silently
    // exclude employees with no gender recorded. required must flip to true here:
    // with required false Sequelize puts the predicate in the ON clause and the
    // row still comes back with a null employee, so the filter would not filter.
    if (filters?.gender?.length) {
      employeeInclude.where = { gender: { [Op.in]: filters.gender } };
      employeeInclude.required = true;
    }

    const tripRequests = await this.tripRequestModel.findAll({
      where,
      include: [
        employeeInclude,
        {
          model: Trip,
          as: 'trip',
          required: false,
          attributes: ['id', 'date', 'shiftTime', 'pickDrop'],
          include: [
            {
              association: 'driver',
              attributes: ['id', 'name', 'code'],
              required: false,
            },
            {
              association: 'vendor',
              attributes: ['id', 'name', 'code'],
              required: false,
            },
            {
              association: 'cab',
              attributes: ['id', 'regNo'],
              required: false,
            },
          ],
        },
      ],
      order: [['deboardTime', 'DESC']],
    });

    if (!tripRequests.length) return [];

    // No night-shift window filter. The evidence in the Op.or above already proves
    // a safe-home check ran, and re-testing historical deboardTime against the
    // CURRENT config would silently drop past escalations whenever an org shifted
    // its night hours.
    const ids = tripRequests.map((tr) => tr.id);

    const histories = await this.safeHomeIVRHistoryModel.findAll({
      where: { callType: 'SAFE_HOME', tripRequestID: { [Op.in]: ids } },
      order: [['createdAt', 'ASC']],
    });

    const alerts = await this.alertModel.findAll({
      where: { tripRequestID: { [Op.in]: ids }, type: 'sos' },
      attributes: ['id', 'tripRequestID', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });

    const historyByRequest = new Map<string, SafeHomeIVRHistory[]>();
    for (const h of histories) {
      const key = String(h.tripRequestID);
      if (!historyByRequest.has(key)) historyByRequest.set(key, []);
      historyByRequest.get(key).push(h);
    }

    const alertByRequest = new Map<string, Alert>();
    for (const a of alerts) {
      const key = String(a.tripRequestID);
      if (!alertByRequest.has(key)) alertByRequest.set(key, a);
    }

    const rows = tripRequests.map((tr) => {
      const calls = historyByRequest.get(String(tr.id)) || [];
      const alert = alertByRequest.get(String(tr.id)) || null;
      const answered = calls.find((c) => c.callStatus === 'Answered');

      return {
        tripRequestID: String(tr.id),
        employeeName: tr.employee?.name || '',
        employeeCode: tr.employeeCode || tr.employee?.employeeCode || '',
        employeePhone: tr.employee?.phone || '',
        gender: tr.employee?.gender || '',

        tripID: tr.tripID ? String(tr.tripID) : '',
        tripDate: tr.date || tr.trip?.date || '',
        shiftTime: tr.shiftTime || tr.trip?.shiftTime || '',
        pickDrop: tr.pickDrop ? 'Pick' : 'Drop',

        vehicleNumber: (tr.trip as any)?.cab?.regNo || '',
        driverName: (tr.trip as any)?.driver?.name || '',
        driverCode: (tr.trip as any)?.driver?.code || '',
        vendorName: (tr.trip as any)?.vendor?.name || '',
        vendorCode: (tr.trip as any)?.vendor?.code || '',

        geoCode: tr.geoCode || '',
        homePoint: tr.locationName || '',

        deboardTime: tr.deboardTime || '',
        deboardLocation: tr.deboardLocation || '',
        deboardMode: tr.deboardMode || '',

        status: this.deriveStatus(tr, calls, answered),
        safeHomeTime: tr.safeHomeTime || '',

        callAttempts: calls.length,
        digitPressed: answered?.digitPressed || '',

        alertRaised: alert ? 'Yes' : 'No',
        alertTime: alert
          ? moment(alert.createdAt)
              .tz('Asia/Kolkata')
              .format('YYYY-MM-DD HH:mm:ss')
          : '',
      };
    });

    if (filters?.status?.length) {
      return rows.filter((r) => filters.status.includes(r.status));
    }
    return rows;
  }

  /**
   * safeHome alone cannot tell PIN from IVR, and it cannot tell "pressed 2"
   * from "never answered" — both leave it false. The history rows supply the
   * missing half.
   */
  private deriveStatus(
    tripRequest: TripRequest,
    calls: SafeHomeIVRHistory[],
    answered?: SafeHomeIVRHistory,
  ): string {
    if (tripRequest.safeHome === true) {
      // A history row with an answered call means the confirmation came from
      // the IVR. digitPressed is the stronger signal, but it is null on rows
      // created before that column existed, so fall back to callStatus.
      return answered ? SAFE_HOME_STATUS.SAFE_IVR : SAFE_HOME_STATUS.SAFE_PIN;
    }
    if (tripRequest.safeHome === false) {
      return answered?.digitPressed === '2'
        ? SAFE_HOME_STATUS.NOT_SAFE_REPORTED
        : SAFE_HOME_STATUS.NOT_SAFE_NO_ANSWER;
    }
    // Null means the check has not resolved yet — the call may still be in
    // flight, or the process restarted before the scheduled check ran.
    return SAFE_HOME_STATUS.PENDING;
  }
}
