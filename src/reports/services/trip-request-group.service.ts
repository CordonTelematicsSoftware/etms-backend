// PARKED — not wired up. Slot grouping for the TR Report Requests/Latest
// columns. Re-enable with the (orgID,date) partial index; without it the
// grouped query seq-scans and cost ~10s on first page load.
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as moment from 'moment';
import { UserType } from 'src/shared/enums';

export interface SlotGroup {
  requestCount: number;
  latestID: string;
}

// Postgres will not take an unbounded IN list, and the export twin loads the whole
// matching set rather than a page (its limit/offset are commented out), so the tuple
// list is chunked instead of being sent as one giant predicate.
const CHUNK_SIZE = 500;

/**
 * A "slot" is one (employeeID, date, shiftTime, pickDrop) tuple - the same key the shift
 * matrix collapses on (trip-request.service.ts:5151). Cancelling a request is an in-place
 * status UPDATE and re-creating INSERTs a new row, so one slot routinely holds 2-3 rows.
 *
 * date is stored as a midnight timestamptz, and the values fed to this key are read back
 * out of the rows we already fetched, so both sides of the map use identical input.
 */
export const slotKey = (
  employeeID: any,
  date: any,
  shiftTime: any,
  pickDrop: any,
): string =>
  `${String(employeeID)}|${
    date instanceof Date ? date.getTime() : new Date(date).getTime()
  }|${String(shiftTime)}|${String(pickDrop)}`;

@Injectable()
export class TripRequestGroupService {
  private logger = new Logger(TripRequestGroupService.name);

  constructor(
    @InjectConnection()
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * How many TripRequests exist in each row's slot, and which of them is the newest.
   *
   * Deliberately UNFILTERED apart from org scoping and soft deletes: the count means
   * "how many requests exist in this slot", not "how many match the caller's filter".
   * A report filtered to status=Approved must still report Requests: 3.
   */
  async getSlotGroups(rows: any[], user: any): Promise<Map<string, SlotGroup>> {
    const groups = new Map<string, SlotGroup>();
    if (!rows?.length) {
      return groups;
    }

    try {
      // SuperAdmin carries no orgID, so it is exempt from the org predicate entirely.
      // Same exemption shape as trip.service.ts:4553-4560.
      const isSuperAdmin = user?.userType === UserType.SuperAdmin;
      const orgID = isSuperAdmin ? null : user?.orgID ?? null;

      // employeeID and pickDrop are both nullable (224-trip-request.js:24-26,66-69).
      // A NULL inside a row-value IN makes the whole comparison UNKNOWN, so such a row
      // could never match its own tuple - skip it and let the caller fall back to
      // "1 request, and this is the latest one" rather than reporting Latest: No.
      const tuples: any[][] = [];
      const seen = new Set<string>();
      let skipped = 0;

      for (const row of rows) {
        const { employeeID, date, shiftTime, pickDrop } = row;
        if (
          employeeID === null ||
          employeeID === undefined ||
          date === null ||
          date === undefined ||
          shiftTime === null ||
          shiftTime === undefined ||
          pickDrop === null ||
          pickDrop === undefined
        ) {
          skipped++;
          continue;
        }

        // Many rows share a slot, so the raw list is heavily duplicated.
        const key = slotKey(employeeID, date, shiftTime, pickDrop);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        tuples.push([employeeID, date, shiftTime, pickDrop]);
      }

      if (skipped > 0) {
        this.logger.warn(
          `${skipped} of ${rows.length} trip requests have a null employeeID/date/shiftTime/pickDrop and were excluded from slot grouping - they will report requestCount 1 / isLatest true`,
        );
      }

      if (!tuples.length) {
        return groups;
      }

      for (let i = 0; i < tuples.length; i += CHUNK_SIZE) {
        const replacements: any = { tuples: tuples.slice(i, i + CHUNK_SIZE) };

        // The org predicate is concatenated in rather than always present with a null
        // replacement: `"orgID" = NULL` is never true, so a SuperAdmin would get an
        // empty result set instead of an unscoped one.
        let orgFilter = '';
        if (orgID !== null && orgID !== undefined) {
          orgFilter = 'AND "orgID" = :orgID';
          replacements.orgID = orgID;
        }

        // deletedAt IS NULL is written out explicitly - this is raw SQL, so Sequelize's
        // paranoid injection does not apply. It also keeps the only usable index in play
        // (trip_requests_employee_date_active, partial on "deletedAt" IS NULL).
        const sql = `
          SELECT "employeeID", "date", "shiftTime", "pickDrop",
                 COUNT(*)::int AS "requestCount",
                 (ARRAY_AGG("id" ORDER BY "createdAt" DESC, "id" DESC))[1] AS "latestID"
          FROM "TripRequests"
          WHERE "deletedAt" IS NULL
            AND ("employeeID", "date", "shiftTime", "pickDrop") IN (:tuples)
            ${orgFilter}
          GROUP BY "employeeID", "date", "shiftTime", "pickDrop"
        `;

        const result: any[] = await this.sequelize.query(sql, {
          replacements,
          type: QueryTypes.SELECT,
        });

        for (const group of result) {
          groups.set(
            slotKey(
              group.employeeID,
              group.date,
              group.shiftTime,
              group.pickDrop,
            ),
            {
              requestCount: Number(group.requestCount),
              latestID: String(group.latestID),
            },
          );
        }
      }
    } catch (error: any) {
      // A broken enrichment must degrade the two derived columns, not 500 the report.
      // Whatever chunks did succeed are kept - each row is independently either grouped
      // or on the fallback.
      this.logger.error(
        `Failed to compute trip request slot groups: ${error.message}`,
        error.stack,
      );
    }

    return groups;
  }

  /**
   * The id of the newest TripRequest in every slot inside the given date range.
   *
   * This is a PRE-filter, unlike getSlotGroups: `latestOnly` has to narrow the set
   * BEFORE findAndCountAll runs, otherwise the page size and the total count would
   * describe the uncollapsed set.
   *
   * Scoped ONLY by orgID and the date range. The caller's status / attendance / noShow /
   * shiftTimes filters are deliberately NOT applied, so "latest" keeps meaning "the
   * newest row in the slot overall" and stays consistent with the isLatest column that
   * already ships. Applying them would make it mean "newest among the rows I can
   * currently see", which contradicts the column.
   *
   * Returns null (not []) when the query fails, so the caller can skip the filter
   * entirely rather than render an empty report.
   */
  async getLatestIDs(
    dateRange: { startDate: any; endDate: any },
    user: any,
  ): Promise<string[] | null> {
    try {
      // SuperAdmin carries no orgID - same exemption shape as getSlotGroups above.
      const isSuperAdmin = user?.userType === UserType.SuperAdmin;
      const orgID = isSuperAdmin ? null : user?.orgID ?? null;

      const replacements: any = {
        // moment(...).toDate(), NOT the bare 'YYYY-MM-DD' string. Sequelize converts the
        // caller's string to LOCAL midnight when it builds its own Op.between, while a
        // bare string here would be cast by Postgres using the SERVER timezone. On a
        // +05:30 box against a UTC server that is a 5.5h shift, which would silently drop
        // the first day of every range from the latest-id set. Passing a Date makes the
        // escaper emit an explicit offset, so both queries cover the identical window.
        startDate: moment(dateRange.startDate).toDate(),
        endDate: moment(dateRange.endDate).toDate(),
      };

      // Concatenated in, never passed as a null replacement: `"orgID" = NULL` is never
      // true and would return zero slots for a SuperAdmin instead of all of them.
      let orgFilter = '';
      if (orgID !== null && orgID !== undefined) {
        orgFilter = 'AND "orgID" = :orgID';
        replacements.orgID = orgID;
      }

      // Second branch: rows with no identifiable slot are never collapsed, matching
      // getSlotGroups, which reports them as requestCount 1 / isLatest true. Without it
      // a GROUP BY would treat all their NULLs as equal and fold unrelated rows into one.
      // This keeps the invariant that every row reading "Latest: Yes" in the All view
      // still appears when the toggle is on. date and shiftTime are NOT NULL in the
      // schema, so only the two nullable columns need guarding.
      const sql = `
        SELECT (ARRAY_AGG("id" ORDER BY "createdAt" DESC, "id" DESC))[1] AS "latestID"
        FROM "TripRequests"
        WHERE "deletedAt" IS NULL
          AND "date" BETWEEN :startDate AND :endDate
          AND "employeeID" IS NOT NULL
          AND "pickDrop" IS NOT NULL
          ${orgFilter}
        GROUP BY "employeeID", "date", "shiftTime", "pickDrop"

        UNION ALL

        SELECT "id" AS "latestID"
        FROM "TripRequests"
        WHERE "deletedAt" IS NULL
          AND "date" BETWEEN :startDate AND :endDate
          AND ("employeeID" IS NULL OR "pickDrop" IS NULL)
          ${orgFilter}
      `;

      const result: any[] = await this.sequelize.query(sql, {
        replacements,
        type: QueryTypes.SELECT,
      });

      // id is BIGINT and arrives from pg as a string.
      return result.map((row) => String(row.latestID));
    } catch (error: any) {
      this.logger.error(
        `Failed to resolve latest trip request ids: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * requestCount / isLatest for one row, given the map from getSlotGroups.
   * id is BIGINT and arrives from pg as a string on both sides, hence String() on each -
   * same convention as tripEditHistory.tsx:96-106.
   */
  decorate(
    row: any,
    groups: Map<string, SlotGroup>,
  ): { requestCount: number; isLatest: boolean } {
    const group = groups.get(
      slotKey(row.employeeID, row.date, row.shiftTime, row.pickDrop),
    );
    return {
      requestCount: group?.requestCount ?? 1,
      isLatest: group ? String(row.id) === String(group.latestID) : true,
    };
  }
}
