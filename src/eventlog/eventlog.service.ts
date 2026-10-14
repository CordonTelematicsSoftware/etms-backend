import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreateEventLogDto } from './dto/create-eventlog.dto';
import { EventLogFilterInput } from './dto/filter.eventLog.input';
import { EventLogListResponse } from './dto/EventLogListResponse.dto';
import { User } from 'src/user/models/user.model';
import { CreateEventLogTypeDto } from './dto/createEventlog.dto';
import { Authentication } from 'src/auth/models/authentication.model';
import { Employee } from 'src/employee/models/employee.model';
import { Op } from 'sequelize';
import { EventLog } from './models/eventlog.model';
import { DynamicEvenetLogModel } from './eventlogDynamicModel';
import * as dayjs from 'dayjs';
import { Sequelize } from 'node_modules/sequelize-typescript/dist/sequelize/sequelize/sequelize';
import { VendorRequest } from 'src/vendor-management/vendor-request/models/vendor-request.model';
import { RequestStatus } from 'src/shared/enums';

@Injectable()
export class EventLogService {
  constructor(
    @InjectModel(EventLog) private logModel: typeof EventLog,
    @InjectModel(Authentication) private authModel: typeof Authentication,
    @InjectModel(Employee) private employeeModel: typeof Employee,
    @InjectModel(VendorRequest)
    private vendorRequestModel: typeof VendorRequest,
    private readonly dynamicEvenetLogModel: DynamicEvenetLogModel,
  ) {}

  /**
   * Resolves the org/vendor scope that a log row should be tagged with.
   *
   * Prefers `liveUser` (the live session/request user, e.g. req.user - now
   * passed by call sites as `eventLog.user`) over `authRecord` (a fresh
   * Authentication DB row looked up by authID), because a SuperAdmin who
   * has switched into an organization only has that fact recorded in their
   * LIVE session's orgID (see organizationSwitching() / SessionService).
   * organizationSwitching() only ever updates session.orgID - never
   * session.userType - so a DB lookup by authID always returns the
   * permanent, switch-oblivious Authentication row (userType:
   * 'SuperAdmin', employeeID: null, forever, switched or not). That row
   * can never tell us "currently acting as org 5".
   *
   *  - liveUser.orgID present -> org-scoped (covers real OrgAdmins AND
   *    switched-in SuperAdmins identically - this is the switch fix)
   *  - else liveUser.vendorID present -> vendor-scoped
   *  - else liveUser.userType === 'SuperAdmin' -> unscoped (only reachable
   *    when genuinely unswitched - no orgID, no vendorID on the session)
   *  - else falls through to the authID-derived lookup below, for any call
   *    site that hasn't been updated to pass `user` yet. Imperfect for
   *    switched actions (same gap as before), but not worse than today.
   *
   * Driver-triggered logging (DriverAuthentication table) is deliberately
   * NOT handled here yet - authID in that flow refers to a different table
   * with its own id sequence, so resolving it needs separate handling.
   * Revisit when driver-triggered event logs are added.
   */
  private async resolveLogScope(
    liveUser: any,
    authRecord: any,
    visibleToAllApprovedOrgs?: boolean,
  ): Promise<{ orgID: any; vendorID: any }> {
    if (liveUser) {
      // Explicit opt-in from the call site: this is a vendor-level action
      // (e.g. editing their own Driver/Cab record), not a trip action, so
      // it should stay tied to the vendor itself even if the vendor also
      // has an org selected in their live session right now. Checked
      // BEFORE liveUser.orgID on purpose - the whole point is to
      // override the org-selected priority for this one case.
      if (liveUser.vendorID && visibleToAllApprovedOrgs) {
        return { orgID: null, vendorID: liveUser.vendorID };
      }
      if (liveUser.orgID) {
        return { orgID: liveUser.orgID, vendorID: null };
      }
      if (liveUser.vendorID) {
        return { orgID: null, vendorID: liveUser.vendorID };
      }
      if (liveUser.userType === 'SuperAdmin') {
        return { orgID: null, vendorID: null };
      }
      // liveUser given but has neither orgID nor vendorID and isn't
      // SuperAdmin - an unexpected shape. Fall through to the
      // authID-derived lookup below rather than guessing.
    }

    if (!authRecord || authRecord.userType === 'SuperAdmin') {
      return { orgID: null, vendorID: null };
    }

    if (authRecord.vendorID) {
      return { orgID: null, vendorID: authRecord.vendorID };
    }

    if (authRecord.employeeID) {
      const employee = await this.employeeModel.findOne({
        where: { id: authRecord.employeeID },
        raw: true,
      });
      return { orgID: employee?.orgID ?? null, vendorID: null };
    }

    return { orgID: null, vendorID: null };
  }

  /**
   * Row-level read filter for a given (request-time) user. Returns
   * `undefined` when the user should see everything - callers must skip
   * adding a where clause in that case rather than passing `{}` around
   * blindly.
   *
   * Keyed off orgID/vendorID PRESENCE, not userType - a switched-in
   * SuperAdmin has userType: 'SuperAdmin' but a live orgID, and must be
   * scoped to that org exactly like a real OrgAdmin, not treated as
   * globally unscoped. userType only grants unscoped visibility once
   * neither orgID nor vendorID is present (i.e. genuinely unswitched).
   *
   * No null-orgID/vendorID fallback (deliberate - see conversation history,
   * "Option 2"). An earlier version matched `{orgID: null, authID: me}` so
   * legacy pre-scoping rows stayed visible to whoever wrote them. Dropped
   * because it doesn't just surface old legacy rows: it also re-leaks any
   * genuinely global row (e.g. a login, which is correctly orgID:null
   * forever) into every org a SuperAdmin later switches into, since the
   * match was purely by authID and never checked whether the row had
   * anything to do with the org currently being viewed. Consequence: rows
   * with orgID/vendorID still null (all pre-fix history, plus any
   * genuinely global row going forward) are now visible ONLY from the
   * true unswitched SuperAdmin console - never from any org- or
   * vendor-scoped view, including for the person who wrote them.
   *
   *  - orgID present -> orgID = user.orgID, OR (orgID IS NULL AND
   *    vendorID IN <vendors this org has approved>). The second half
   *    covers vendor actions that are genuinely org-agnostic - a vendor
   *    editing their own Driver/Cab record, viewing their Alert list,
   *    etc - written with orgID: null, vendorID: <theirs> by
   *    resolveLogScope() above, since the vendor wasn't acting inside any
   *    specific org's session at the time. Per product rule, vendors
   *    cannot perform trip-related actions without first selecting an
   *    org, so trip logs are always written with a real orgID and never
   *    fall into this vendorID fallback - only non-trip, vendor-level
   *    actions do. Approval is read from VendorOrganizations
   *    (requestStatus === RequestStatus.Approved), so only orgs the
   *    vendor is actually approved for see these rows - not every org in
   *    the system. This is now async (one extra query) purely for this
   *    branch; every other branch is unchanged and still synchronous in
   *    spirit.
   *  - else vendorID present -> vendorID = user.vendorID, exact match only
   *  - else userType === 'SuperAdmin' -> unscoped, sees everything
   *  - else -> fail closed: scoped to only their own actions (shouldn't
   *    normally happen - no orgID, no vendorID, not SuperAdmin - but safer
   *    than defaulting to open)
   */
  private async buildScopeWhere(user: any): Promise<any | undefined> {
    if (!user) {
      return undefined;
    }

    if (user.orgID) {
      const approvedVendors = await this.vendorRequestModel.findAll({
        where: {
          orgID: user.orgID,
          requestStatus: RequestStatus.Approved,
        },
        attributes: ['vendorID'],
        raw: true,
      });
      const approvedVendorIds = approvedVendors
        .map((v: any) => v.vendorID)
        .filter(Boolean);

      if (approvedVendorIds.length > 0) {
        return {
          [Op.or]: [
            { orgID: user.orgID },
            { orgID: null, vendorID: { [Op.in]: approvedVendorIds } },
          ],
        };
      }

      return { orgID: user.orgID };
    }

    if (user.vendorID) {
      return { vendorID: user.vendorID };
    }

    if (user.userType === 'SuperAdmin') {
      return undefined;
    }

    return { authID: user.id };
  }

  /** Combines any number of where-clause fragments (ignoring undefined/null ones) with Op.and. */
  private mergeWhere(...clauses: Array<any | undefined | null>): any {
    const present = clauses.filter((c) => c !== undefined && c !== null);
    if (present.length === 0) return {};
    if (present.length === 1) return present[0];
    return { [Op.and]: present };
  }

  async create(createEventLogDto: CreateEventLogDto, transaction?: any) {
    try {
      const {
        objectType,
        objectID,
        updatedBy,
        authID,
        changeType,
        payload,
        requestPayload,
        customDescription,
        changeJSON,
        visibleToAllApprovedOrgs,
        user: liveUser,
      } = createEventLogDto;

      // Resolved up front, before any description text is built, so both
      // the `updatedBy` column and every description variant (standard +
      // custom) end up using the same, reliable value.
      const authRecord = await this.authModel.findOne({
        where: {
          id: authID,
        },
        raw: true,
        transaction,
      });

      const userEmail = authRecord?.email ? authRecord.email : '';
      // Prefer Authentication's own `name` column over the caller-supplied
      // `updatedBy` string. `updatedBy` traces back to the session's `name`
      // column (see JwtStrategy/SessionService), which can drift independently
      // of the account's real name - e.g. sessions observed with `name`
      // stored as the literal string "0". Authentication is looked up here
      // directly by authID and isn't subject to that drift. Falls back to
      // the caller-supplied value only if Authentication's name is itself
      // empty, so this can never be worse than the old behaviour.
      const resolvedName =
        authRecord?.name && String(authRecord.name).trim() !== ''
          ? authRecord.name
          : updatedBy;

      // Append the employee code for employee-type accounts - "Emp2 - E134" -
      // so the same first-name-only value across different orgs/employees is
      // disambiguated in the log. Authentication has no employeeCode of its
      // own (only Employee does), hence the extra lookup here; scoped to
      // authRecord.employeeID being present, which SuperAdmin/Vendor accounts
      // never have, so they're unaffected and keep the plain resolved name.
      let displayName = resolvedName;
      if (authRecord?.employeeID) {
        const employee = await this.employeeModel.findOne({
          where: { id: authRecord.employeeID },
          attributes: ['employeeCode'],
          raw: true,
        });
        if (employee?.employeeCode) {
          displayName = `${resolvedName} - ${employee.employeeCode}`;
        }
      }

      const insertObject: any = {};
      if (changeJSON !== undefined && changeJSON !== null) {
        insertObject.changeJSON = changeJSON;
      } else if (changeType == 'edit') {
        const changeJosn = await this.createChangeJson(payload, requestPayload);
        insertObject.changeJSON = changeJosn;
      }
      const desObj = await this.generateDescription(
        changeType,
        displayName,
        objectType,
        insertObject,
        authID,
      );

      insertObject.objectType = objectType;
      insertObject.objectID = objectID;
      insertObject.updatedBy = displayName;
      insertObject.authID = authID;
      insertObject.changeType = desObj.type;

      // description is a hard varchar(255) column. Truncating a customDescription
      // at the CALLER never actually protects this insert, because this prefix
      // (displayName + email) is appended AFTER the caller's own truncation and
      // can push an already-safe string back over 255 (observed: a caller-side
      // 250-char cap still failed here with "value too long for type character
      // varying(255)"). Enforced once, authoritatively, at the point the final
      // string is actually assembled - covers every call site, not just the ones
      // that remembered to budget for this prefix.
      const MAX_DESCRIPTION_LENGTH = 255;
      const rawDescription = customDescription
        ? displayName + '(' + userEmail + ') ' + customDescription
        : desObj.description;
      insertObject.description =
        rawDescription?.length > MAX_DESCRIPTION_LENGTH
          ? `${rawDescription.slice(0, MAX_DESCRIPTION_LENGTH - 3)}...`
          : rawDescription;

      insertObject.payloadJSON = payload;

      const scope = await this.resolveLogScope(
        liveUser,
        authRecord,
        visibleToAllApprovedOrgs,
      );
      insertObject.orgID = scope.orgID;
      insertObject.vendorID = scope.vendorID;

      try {
        await this.dynamicEvenetLogModel.ensureTableExists();
        const EventLogModel = this.dynamicEvenetLogModel.getLogModel();

        return await EventLogModel.create(insertObject);
      } catch (error) {
        throw new InternalServerErrorException(error);
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async bulkCreate(eventLogsDto: CreateEventLogDto[]) {
    try {
      const insertObjects = [];
      // Cache the DB-derived Authentication row per authID so a bulk write
      // from a single actor doesn't repeat that lookup per row. Each row's
      // own live `user` (if supplied) still takes priority in
      // resolveLogScope - this cache only feeds the fallback path.
      const authRecordCache = new Map<string, any>();
      // Cache employeeCode per authID too (see create() for why this lookup
      // exists at all) - null is a valid cached value (no code found /
      // not an employee account), so presence is checked with .has().
      const employeeCodeCache = new Map<string, string | null>();

      for (const eventLogDto of eventLogsDto) {
        const {
          objectType,
          objectID,
          updatedBy,
          authID,
          changeType,
          payload,
          requestPayload,
          customDescription,
          changeJSON,
          visibleToAllApprovedOrgs,
          user: liveUser,
        } = eventLogDto;

        const cacheKey = String(authID);
        if (!authRecordCache.has(cacheKey)) {
          const authRecord = await this.authModel.findOne({
            where: { id: authID },
            raw: true,
          });
          authRecordCache.set(cacheKey, authRecord);
        }
        const authRecord = authRecordCache.get(cacheKey);
        // Same reasoning as create(): prefer Authentication's own `name`
        // over the caller-supplied `updatedBy`, which traces back to the
        // session's `name` column and can drift independently (observed
        // stuck at the literal string "0" on some rows).
        const resolvedName =
          authRecord?.name && String(authRecord.name).trim() !== ''
            ? authRecord.name
            : updatedBy;

        // Same employeeCode enrichment as create() - "Emp2 - E134" - cached
        // per authID so a bulk write from one actor only looks it up once.
        let displayName = resolvedName;
        if (authRecord?.employeeID) {
          if (!employeeCodeCache.has(cacheKey)) {
            const employee = await this.employeeModel.findOne({
              where: { id: authRecord.employeeID },
              attributes: ['employeeCode'],
              raw: true,
            });
            employeeCodeCache.set(cacheKey, employee?.employeeCode ?? null);
          }
          const employeeCode = employeeCodeCache.get(cacheKey);
          if (employeeCode) {
            displayName = `${resolvedName} - ${employeeCode}`;
          }
        }

        const insertObject: any = {};

        if (changeJSON !== undefined && changeJSON !== null) {
          insertObject.changeJSON = changeJSON;
        } else if (changeType === 'edit') {
          const changeJson = await this.createChangeJson(
            payload,
            requestPayload,
          );
          insertObject.changeJSON = changeJson;
        }

        const desObj = await this.generateDescription(
          changeType,
          displayName,
          objectType,
          insertObject,
          authID,
        );

        const scope = await this.resolveLogScope(
          liveUser,
          authRecord,
          visibleToAllApprovedOrgs,
        );
        const userEmail = authRecord?.email ? authRecord.email : '';

        insertObject.objectType = objectType;
        insertObject.objectID = objectID;
        insertObject.updatedBy = displayName;
        insertObject.authID = authID;
        insertObject.changeType = desObj.type;

        const MAX_DESCRIPTION_LENGTH = 255;
        const rawDescription = customDescription
          ? displayName + '(' + userEmail + ') ' + customDescription
          : desObj.description;
        insertObject.description =
          rawDescription?.length > MAX_DESCRIPTION_LENGTH
            ? `${rawDescription.slice(0, MAX_DESCRIPTION_LENGTH - 3)}...`
            : rawDescription;

        insertObject.payloadJSON = payload;
        insertObject.orgID = scope.orgID;
        insertObject.vendorID = scope.vendorID;

        insertObjects.push(insertObject);
      }

      try {
        await this.dynamicEvenetLogModel.ensureTableExists();
        const EventLogModel = this.dynamicEvenetLogModel.getLogModel();

        return await EventLogModel.bulkCreate(insertObjects);
      } catch (error) {
        throw new InternalServerErrorException(error);
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async createWithType(createEventLogtypeDto: CreateEventLogTypeDto) {
    const {
      objectType,
      objectID,
      updatedBy,
      authID,
      changeType,
      payload,
      requestPayload,
      type,
    } = createEventLogtypeDto;

    const insertObject: any = {};
    if (changeType == 'edit') {
      const changeJosn = await this.createChangeJson(payload, requestPayload);
      insertObject.changeJSON = changeJosn;
    }
    const desObj = await this.generateDescription(
      changeType,
      updatedBy,
      objectType,
      insertObject,
      authID,
    );

    insertObject.objectType = objectType;
    insertObject.objectID = objectID;
    insertObject.updatedBy = updatedBy;
    insertObject.authID = authID;
    insertObject.changeType = desObj.type;
    insertObject.description = desObj.description;
    insertObject.payloadJSON = payload;
    insertObject.type = type;
    try {
      return await this.logModel.create(insertObject);
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async createChangeJson(payload: any, requestPayload: any) {
    const changeJson: any = {};
    payload = payload?.dataValues ? payload.dataValues : {};
    for (const pKey in payload) {
      if (requestPayload[pKey]) {
        if (requestPayload[pKey] != payload[pKey]) {
          changeJson[pKey] = {
            OldValue: payload[pKey],
            newValue: requestPayload[pKey],
          };
        }
      }
    }
    return changeJson;
  }

  async generateDescription(
    changeType: any,
    updatedBy: any,
    objectType: any,
    insertObject: any,
    authID: bigint,
  ) {
    let res = {
      type: changeType,
      description: '',
    };
    const user = await this.authModel.findOne({
      where: {
        id: authID,
      },
      raw: true,
    });

    const userEmail = user?.email ? user.email : '';
    updatedBy = updatedBy + '(' + userEmail + ')';

    if (changeType == 'add') {
      res = {
        type: changeType,
        description: updatedBy + '  created new ' + objectType,
      };
    } else if (changeType == 'edit') {
      let comment = '';

      if (insertObject.changeJSON) {
        const count = Object.keys(insertObject.changeJSON).length;
        if (count > 1) {
          comment =
            updatedBy + '  updated ' + count + ' fields in ' + objectType;
        } else {
          comment = updatedBy + ' updated ' + objectType;
        }
      }
      res = {
        type: changeType,
        description: comment,
      };
    } else if (changeType == 'view') {
      res = {
        type: changeType,
        description: updatedBy + '  viewed ' + objectType,
      };
    } else if (changeType == 'list') {
      res = {
        type: changeType,
        description: updatedBy + '  viewed ' + objectType + ' list ',
      };
    } else if (changeType == 'delete') {
      res = {
        type: changeType,
        description: updatedBy + ' removed ' + objectType,
      };
    } else if (changeType == 'export') {
      res = {
        type: changeType,
        description: updatedBy + ' exported ' + objectType,
      };
    } else if (changeType == 'import') {
      res = {
        type: changeType,
        description: updatedBy + ' imported ' + objectType,
      };
    } else if (changeType == 'mail') {
      res = {
        type: changeType,
        description: updatedBy + ' mailed ' + objectType,
      };
    } else if (changeType == 'update password') {
      res = {
        type: 'update',
        description: updatedBy + '  changed password ' + objectType,
      };
    } else if (changeType == 'locked') {
      res = {
        type: changeType,
        description: updatedBy + ' locked ' + objectType,
      };
    } else if (changeType == 'login') {
      res = {
        type: 'login',
        description: updatedBy + '  has been logged in ',
      };
    } else if (changeType == 'convert') {
      res = {
        type: 'converted',
        description: updatedBy + 'converted ' + objectType + ' to customer',
      };
    }

    return res;
  }

  async getEventLogList(
    eventLogFilterInput: EventLogFilterInput,
    currentUser: User,
  ): Promise<EventLogListResponse> {
    const {
      take = 25,
      skip = 0,
      // search = '%',
      limit,
      orderColumn = 'id',
      orderDirection = 'DESC',
      objectType = '%',
      // changeType = '%',
      userId,
      objectID,
      type,
      fromDate,
      toDate,
    } = eventLogFilterInput;
    let whereClause: any;

    if (fromDate && toDate) {
      whereClause = {
        ...whereClause,
        ...{
          createdAt: {
            [Op.between]: [fromDate, toDate],
          },
        },
      };
    } else if (fromDate && !toDate) {
      whereClause = {
        ...whereClause,
        ...{
          createdAt: fromDate,
        },
      };
    }

    if (objectType && objectID) {
      whereClause = {
        ...whereClause,
        ...{
          objectID: objectID,
        },
      };
    }
    if (type) {
      whereClause = {
        ...whereClause,
        ...{
          type: type,
        },
      };
    }
    if (userId) {
      whereClause = {
        ...whereClause,
        ...{
          userId: currentUser.id,
        },
      };
    }

    const eventLog = await this.logModel.findAndCountAll({
      where: whereClause,
      order: [[`${orderColumn}`, `${orderDirection}`]],
      limit,
      offset: take * skip,
    });
    return { eventData: eventLog.rows, eventCount: eventLog.count };
  }

  public async getCurrentMonthLogs(
    user: any,
    { skip, take, month, date, year, search, objectType },
  ) {
    const LogModel = await this.dynamicEvenetLogModel.getCurrentMonthLogModel(
      month,
      year,
    );

    const queryOptions: any = {
      order: [['createdAt', 'DESC']],
    };

    const whereClauses: any[] = [];

    const scopeWhere = await this.buildScopeWhere(user);
    if (scopeWhere) whereClauses.push(scopeWhere);

    // Add pagination
    const { page = skip + 1, pageSize = take } = user; // Default values if not provided
    const offset = (page - 1) * pageSize;
    queryOptions.limit = pageSize;
    queryOptions.offset = offset;

    if (search) {
      whereClauses.push({
        [Op.or]: [
          Sequelize.where(
            Sequelize.fn(
              'REGEXP_REPLACE',
              Sequelize.col('description'),
              '\\s+', // regex for 1 or more spaces
              ' ', // replace with single space
              'g', // global flag
            ),
            {
              [Op.iLike]: `%${search.replace(/\s+/g, ' ')}%`, // normalize search input
            },
          ),
          { objectType: { [Op.iLike]: `%${search}%` } },
          { changeType: { [Op.iLike]: `%${search}%` } },
          { updatedBy: { [Op.iLike]: `%${search}%` } },
        ],
      });
    }

    if (date) {
      const formattedDate = dayjs(date).format('YYYY-MM-DD');
      whereClauses.push({
        createdAt: {
          [Op.gte]: `${formattedDate} 00:00:00`,
          [Op.lte]: `${formattedDate} 23:59:59`,
        },
      });
    }

    if (year) {
      whereClauses.push({
        createdAt: {
          [Op.between]: [`${year}-01-01 00:00:00`, `${year}-12-31 23:59:59`],
        },
      });
    }

    if (objectType) {
      whereClauses.push({
        objectType: { [Op.iLike]: `%${objectType}%` },
      });
    }

    queryOptions.where = this.mergeWhere(...whereClauses);

    // Fetch logs
    try {
      const logs = await LogModel.findAll(queryOptions);
      const totalCount = await LogModel.count(queryOptions);
      return { logs, totalCount };
    } catch (error) {
      if (
        error.name === 'SequelizeDatabaseError' &&
        error.message.includes('does not exist')
      ) {
        return { message: 'No event logs found' };
      }
      throw error;
    }
  }

  /**
   * Reads audit rows for specific objects out of the monthly EventLogs_<mon>_<year>
   * tables. Each target is an (objectType, objectID) pair, because a single
   * logical record can be logged under more than one objectType/ID
   * (e.g. a trip is 'Trip'/tripID while its billing row is
   * 'Trip Actuals'/tripActualID).
   *
   * `months` is resolved by the caller and intersected here against the tables
   * that actually exist, so a month that was never written does not throw.
   */
  public async getObjectHistory(
    targets: Array<{ objectType: string; objectID: any }>,
    months: Array<{ month: string; year: string }>,
    {
      skip = 0,
      take = 50,
      orgID,
      user,
    }: { skip?: number; take?: number; orgID?: any; user?: any } = {},
  ) {
    if (!targets?.length || !months?.length) {
      return { items: [], totalItems: 0, monthsSearched: [] };
    }

    // NOT a raw `information_schema.tables` query: any raw SQL starting with
    // the literal string "SELECT table_name FROM information_schema.tables"
    // is silently hijacked by Sequelize's own postgres dialect (used
    // internally for queryInterface.showAllTables()/tableExistsQuery(), see
    // node_modules/sequelize/lib/dialects/postgres/query.js - isTableNameQuery),
    // which converts every row from {table_name: 'X'} to Object.values(row)
    // (['X']) and returns the flat mapped array instead of the normal
    // [rows, metadata] tuple. That collision is what made this endpoint
    // always return monthsSearched: [] regardless of what data existed.
    // showAllTables() is Sequelize's own public API for this and cannot
    // collide with its own internal query.
    const allTables: string[] = await this.logModel.sequelize
      .getQueryInterface()
      .showAllTables();
    const existing = new Set(allTables);

    const targetMatch = {
      [Op.or]: targets.map((target) => ({
        objectType: target.objectType,
        objectID: target.objectID,
      })),
    };

    // create() now resolves and persists orgID/vendorID for every row (see
    // EventLogService.create), so this scoping has real data behind it.
    // Prefer full user-based scoping (handles SuperAdmin/Org/Vendor)
    // whenever a user is supplied; fall back to the older orgID-only guard
    // for any caller that still only passes orgID. No null-orgID fallback
    // here either, matching buildScopeWhere's Option 2 (see its doc
    // comment) - a null-orgID row is either pre-fix history or a
    // genuinely global row, and neither belongs on an org-scoped result.
    const scopeWhere = user
      ? await this.buildScopeWhere(user)
      : orgID !== undefined && orgID !== null
      ? { orgID }
      : undefined;

    const where = this.mergeWhere(targetMatch, scopeWhere);

    const monthsSearched: string[] = [];
    let rows: any[] = [];

    for (const entry of months) {
      const tableName = `EventLogs_${entry.month}_${entry.year}`;
      if (!existing.has(tableName)) {
        continue;
      }
      const LogModel = await this.dynamicEvenetLogModel.getCurrentMonthLogModel(
        entry.month,
        entry.year,
      );
      const monthRows = await LogModel.findAll({
        where,
        // payloadJSON is deliberately excluded - it holds the full row snapshot
        // and would dominate the response size.
        attributes: [
          'id',
          'objectType',
          'objectID',
          'changeType',
          'description',
          'updatedBy',
          'authID',
          'changeJSON',
          'createdAt',
        ],
        order: [['createdAt', 'DESC']],
      });
      monthsSearched.push(tableName);
      rows = rows.concat(monthRows.map((row: any) => row.toJSON()));
    }

    // id DESC breaks createdAt ties, so two rows written in the same
    // millisecond (a billing edit and the Trip Actuals recalc it triggers)
    // cannot swap places between pages and be shown twice or skipped.
    // id is BIGINT and arrives from pg as a STRING, so compare numerically -
    // a lexical compare would order '9' after '10'.
    rows.sort((a, b) => {
      const byCreatedAt =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (byCreatedAt !== 0) {
        return byCreatedAt;
      }
      return Number(b.id) - Number(a.id);
    });

    const totalItems = rows.length;
    const offset = Number(skip) || 0;
    const limit = Number(take) || 50;

    return {
      items: rows.slice(offset, offset + limit),
      totalItems,
      monthsSearched,
    };
  }

  public async getModules(user: any, month?: string, year?: string) {
    const LogModel = await this.dynamicEvenetLogModel.getCurrentMonthLogModel(
      month,
      year,
    );
    const queryOptions: any = {
      attributes: [
        [Sequelize.fn('DISTINCT', Sequelize.col('objectType')), 'objectType'],
      ],
      order: [['objectType', 'ASC']],
    };

    const scopeWhere = await this.buildScopeWhere(user);
    if (scopeWhere) {
      queryOptions.where = scopeWhere;
    }

    try {
      const modules = await LogModel.findAll(queryOptions);
      return modules.map((m: any) => m.objectType).filter(Boolean);
    } catch (err: any) {
      // PostgreSQL error code 42P01 = table does not exist
      if (err?.original?.code === '42P01') {
        return []; // table missing(no event table for the month) → return empty array
      }
      throw err; // rethrow other errors
    }
  }

  public async exportEventLogs(
    user: any,
    {
      startDate,
      endDate,
      objectType,
    }: { startDate: string; endDate: string; objectType?: string },
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'startDate and endDate are required to export event logs',
      );
    }

    const start = dayjs(startDate).startOf('day');
    const end = dayjs(endDate).endOf('day');

    const monthsToQuery: { month: string; year: number }[] = [];
    let cursor = start.startOf('month');
    while (cursor.isBefore(end) || cursor.isSame(end, 'month')) {
      monthsToQuery.push({
        month: cursor.format('MMM').toLowerCase(),
        year: cursor.year(),
      });
      cursor = cursor.add(1, 'month');
    }

    let allLogs: any[] = [];
    const scopeWhere = await this.buildScopeWhere(user);

    for (const { month, year } of monthsToQuery) {
      const LogModel = await this.dynamicEvenetLogModel.getCurrentMonthLogModel(
        month,
        String(year),
      );

      let where: any = this.mergeWhere(
        { createdAt: { [Op.gte]: start.toDate(), [Op.lte]: end.toDate() } },
        scopeWhere,
      );

      if (objectType) {
        where = this.mergeWhere(where, {
          objectType: { [Op.iLike]: `%${objectType}%` },
        });
      }

      try {
        const logs = await LogModel.findAll({
          where,
          order: [['createdAt', 'DESC']],
        });
        allLogs = allLogs.concat(logs);
      } catch (error: any) {
        if (
          error.name === 'SequelizeDatabaseError' &&
          (error.message.includes('does not exist') ||
            error?.original?.code === '42P01')
        ) {
          continue;
        }
        throw error;
      }
    }

    allLogs.sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return { items: allLogs, totalItems: allLogs.length };
  }

  public async getLogsByDateRange(
    user: any,
    {
      startDate,
      endDate,
      objectType,
      search,
      skip = 0,
      take = 25,
    }: {
      startDate: string;
      endDate: string;
      objectType?: string;
      search?: string;
      skip?: number;
      take?: number;
    },
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    const start = dayjs(startDate).startOf('day');
    const end = dayjs(endDate).endOf('day');

    const monthsToQuery: { month: string; year: number }[] = [];
    let cursor = start.startOf('month');
    while (cursor.isBefore(end) || cursor.isSame(end, 'month')) {
      monthsToQuery.push({
        month: cursor.format('MMM').toLowerCase(),
        year: cursor.year(),
      });
      cursor = cursor.add(1, 'month');
    }

    let allLogs: any[] = [];
    const scopeWhere = await this.buildScopeWhere(user);

    for (const { month, year } of monthsToQuery) {
      const LogModel = await this.dynamicEvenetLogModel.getCurrentMonthLogModel(
        month,
        String(year),
      );

      let where: any = this.mergeWhere(
        { createdAt: { [Op.gte]: start.toDate(), [Op.lte]: end.toDate() } },
        scopeWhere,
      );

      if (objectType) {
        where = this.mergeWhere(where, {
          objectType: { [Op.iLike]: `%${objectType}%` },
        });
      }

      // if (search) {
      //   const searchConditions = {
      //     [Op.or]: [
      //       Sequelize.where(
      //         Sequelize.fn(
      //           'REGEXP_REPLACE',
      //           Sequelize.col('description'),
      //           '\\s+',
      //           ' ',
      //           'g',
      //         ),
      //         { [Op.iLike]: `%${search.replace(/\s+/g, ' ')}%` },
      //       ),
      //       { objectType: { [Op.iLike]: `%${search}%` } },
      //       { changeType: { [Op.iLike]: `%${search}%` } },
      //       { updatedBy: { [Op.iLike]: `%${search}%` } },
      //     ],
      //   };
      //   where = this.mergeWhere(where, searchConditions);
      // }
      if (search) {
        const term = search.trim();
        const isNumeric = /^\d{1,18}$/.test(term); // 18 digits max to stay inside BIGINT

        const searchOr: any[] = [
          Sequelize.where(
            Sequelize.fn(
              'REGEXP_REPLACE',
              Sequelize.col('description'),
              '\\s+',
              ' ',
              'g',
            ),
            { [Op.iLike]: `%${term.replace(/\s+/g, ' ')}%` },
          ),
          { objectType: { [Op.iLike]: `%${term}%` } },
          { changeType: { [Op.iLike]: `%${term}%` } },
          { updatedBy: { [Op.iLike]: `%${term}%` } },
        ];

        if (isNumeric) {
          // exact match on the ID columns
          searchOr.push({ objectID: term });
          searchOr.push({ employeeID: term });

          // whole-number match inside the JSON columns, so "116395" does not
          // match "1163951" and also works for "116395,116396" style strings
          const wholeNumber = `(^|[^0-9])${term}([^0-9]|$)`;
          searchOr.push(
            Sequelize.where(
              Sequelize.cast(Sequelize.col('payloadJSON'), 'text'),
              {
                [Op.regexp]: wholeNumber,
              },
            ),
            Sequelize.where(
              Sequelize.cast(Sequelize.col('changeJSON'), 'text'),
              {
                [Op.regexp]: wholeNumber,
              },
            ),
          );
        }

        where = this.mergeWhere(where, { [Op.or]: searchOr });
      }

      try {
        const logs = await LogModel.findAll({
          where,
          order: [['createdAt', 'DESC']],
        });
        allLogs = allLogs.concat(
          logs.map((l: any) => (l.toJSON ? l.toJSON() : l)),
        );
      } catch (error: any) {
        if (
          error.name === 'SequelizeDatabaseError' &&
          (error.message.includes('does not exist') ||
            error?.original?.code === '42P01')
        ) {
          continue; // month has no table yet — nothing to add
        }
        throw error;
      }
    }

    allLogs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const totalCount = allLogs.length;
    const offset = skip * take;
    const pageItems = allLogs.slice(offset, offset + take);

    return { logs: pageItems, totalCount };
  }

  public async getModulesByDateRange(
    user: any,
    startDate: string,
    endDate: string,
  ) {
    if (!startDate || !endDate) return [];

    const start = dayjs(startDate).startOf('month');
    const end = dayjs(endDate).endOf('month');

    const monthsToQuery: { month: string; year: number }[] = [];
    let cursor = start.clone();
    while (cursor.isBefore(end) || cursor.isSame(end, 'month')) {
      monthsToQuery.push({
        month: cursor.format('MMM').toLowerCase(),
        year: cursor.year(),
      });
      cursor = cursor.add(1, 'month');
    }

    const scopeWhere = await this.buildScopeWhere(user);
    const modulesSet = new Set<string>();
    for (const { month, year } of monthsToQuery) {
      const LogModel = await this.dynamicEvenetLogModel.getCurrentMonthLogModel(
        month,
        String(year),
      );
      try {
        const rows = await LogModel.findAll({
          attributes: [
            [
              Sequelize.fn('DISTINCT', Sequelize.col('objectType')),
              'objectType',
            ],
          ],
          where: scopeWhere,
        });
        rows.forEach((r: any) => {
          if (r.objectType) modulesSet.add(r.objectType);
        });
      } catch (err: any) {
        if (err?.original?.code === '42P01') continue;
        throw err;
      }
    }
    return Array.from(modulesSet).sort();
  }
}
