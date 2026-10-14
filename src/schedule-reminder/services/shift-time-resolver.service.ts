import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';

import { Team } from 'src/team/models/team.model';
import { ConfigurationMaster } from 'src/config-management/config/models/config.model';
import { CompanyConfiguration } from 'src/config-management/company-config/models/company-config.model';

import {
  ResolvedShiftTimes,
  SHIFT_CONFIG_LOGIN,
  SHIFT_CONFIG_LOGOUT,
  normalizeConfigName,
  parseTimeList,
  resolveForTeam,
} from '../utils/shift-time.util';

/** Key shape: 'team:<id>' for a team override, 'org:<id>' for the default. */
export type ShiftCohortKey = string;

export interface ShiftTimeIndex {
  /** Every cohort that has at least one shift time, keyed as above. */
  cohorts: Map<ShiftCohortKey, ResolvedShiftTimes>;
  /** Teams whose config overrides the org, so the org cohort can exclude them. */
  overrideTeamIDs: bigint[];
  /** Cohorts that resolved to nothing, for the sweep summary. */
  skipped: { key: ShiftCohortKey; reason: string }[];
}

/**
 * Batched shift-time resolution: team -> org -> global.
 *
 * Three queries total, regardless of employee count. The per-employee resolver
 * behind GET /admin/config/employee/shiftTime issues one query per employee,
 * which is unusable here — a single org in UAT has ~2500 active employees, and
 * every one of them shares their team's or their org's times.
 */
@Injectable()
export class ShiftTimeResolverService {
  private readonly logger = new Logger(ShiftTimeResolverService.name);

  constructor(
    @InjectModel(Team)
    private readonly teamModel: typeof Team,
    @InjectModel(ConfigurationMaster)
    private readonly configurationMasterModel: typeof ConfigurationMaster,
    @InjectModel(CompanyConfiguration)
    private readonly companyConfigurationModel: typeof CompanyConfiguration,
  ) {}

  async buildIndex(orgID: bigint): Promise<ShiftTimeIndex> {
    const index: ShiftTimeIndex = {
      cohorts: new Map(),
      overrideTeamIDs: [],
      skipped: [],
    };

    const orgTimes = await this.resolveOrgShiftTimes(orgID);

    const teams = await this.teamModel.findAll({
      where: { orgID, isShiftEnabled: true },
      attributes: [
        'id',
        'name',
        'isShiftEnabled',
        'shiftLoginTime',
        'shiftLogoutTime',
      ],
    });

    for (const team of teams) {
      const resolved = resolveForTeam(team as any);
      if (!resolved) {
        // Config enabled but both lists empty — inherits the org, so the
        // employee stays in the org cohort rather than getting its own query.
        continue;
      }

      const key = `team:${team.id}`;
      index.overrideTeamIDs.push(team.id);

      if (resolved.pick.length === 0 && resolved.drop.length === 0) {
        index.skipped.push({
          key,
          reason: resolved.reason ?? 'no shift times',
        });
        continue;
      }

      index.cohorts.set(key, resolved);
      if (resolved.reason) {
        index.skipped.push({ key, reason: resolved.reason });
      }
    }

    const orgKey = `org:${orgID}`;
    if (orgTimes.pick.length === 0 && orgTimes.drop.length === 0) {
      index.skipped.push({
        key: orgKey,
        reason: orgTimes.reason ?? 'no shift times configured',
      });
    } else {
      index.cohorts.set(orgKey, orgTimes);
      if (orgTimes.reason) {
        index.skipped.push({ key: orgKey, reason: orgTimes.reason });
      }
    }

    return index;
  }

  /**
   * Org override, else the global master default.
   *
   * The master row is read from defaultValue first and configValue second.
   * ConfigurationMasters has both, and they diverge: the SuperAdmin PATCH
   * branch writes configValue (text[]) while every read path in the booking
   * code uses CompanyConfigurations.configValue ?? defaultValue. Preferring
   * defaultValue keeps reminders aligned with what booking actually enforces;
   * configValue is consulted only as a last resort so a fresh install with
   * seeded array values is not left with nothing.
   */
  async resolveOrgShiftTimes(orgID: bigint): Promise<ResolvedShiftTimes> {
    const masters = await this.configurationMasterModel.findAll({
      attributes: ['id', 'configName', 'configValue', 'defaultValue'],
    });

    const wanted = new Map<string, ConfigurationMaster>();
    for (const master of masters) {
      const name = normalizeConfigName(master.configName);
      if (name === normalizeConfigName(SHIFT_CONFIG_LOGIN)) {
        wanted.set('pick', master);
      } else if (name === normalizeConfigName(SHIFT_CONFIG_LOGOUT)) {
        wanted.set('drop', master);
      }
    }

    if (wanted.size === 0) {
      return {
        pick: [],
        drop: [],
        source: 'none',
        reason: 'Login time / Logout time config rows do not exist',
      };
    }

    const overrides = await this.companyConfigurationModel.findAll({
      where: {
        orgID,
        configID: { [Op.in]: [...wanted.values()].map((row) => row.id) },
      },
      attributes: ['configID', 'configValue'],
    });

    const overrideByConfigID = new Map<string, unknown>();
    for (const row of overrides) {
      overrideByConfigID.set(String(row.configID), row.configValue);
    }

    const reasons: string[] = [];
    let source: ResolvedShiftTimes['source'] = 'global';

    const resolveLeg = (leg: 'pick' | 'drop'): string[] => {
      const master = wanted.get(leg);
      if (!master) {
        reasons.push(`${leg}: config row missing`);
        return [];
      }

      const override = overrideByConfigID.get(String(master.id));
      if (override !== undefined && override !== null && override !== '') {
        const parsed = parseTimeList(override);
        if (parsed.times.length > 0) {
          source = 'org';
          return parsed.times;
        }
        reasons.push(`${leg}: org override rejected — ${parsed.reason}`);
        return [];
      }

      const fromDefault = parseTimeList(master.defaultValue);
      if (fromDefault.times.length > 0) {
        return fromDefault.times;
      }

      const fromConfigValue = parseTimeList(master.configValue);
      if (fromConfigValue.times.length > 0) {
        return fromConfigValue.times;
      }

      reasons.push(`${leg}: ${fromDefault.reason ?? 'no global default'}`);
      return [];
    };

    const pick = resolveLeg('pick');
    const drop = resolveLeg('drop');

    return {
      pick,
      drop,
      source: pick.length === 0 && drop.length === 0 ? 'none' : source,
      reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    };
  }
}
