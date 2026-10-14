import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Route } from '../models/route.model';
import { CreateRouteInput } from '../dtos/create-route-input-dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { RouteFilterInput } from '../dtos/route-filter-input-dto';
import { SortOrder } from 'src/shared/enums';
import { Op } from 'sequelize';
import { UpdateRouteInput } from '../dtos/update-route-input-dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Location } from 'src/location-management/locations/models/location.model';
import * as XLSX from 'xlsx';
import { Sequelize } from 'sequelize-typescript';

@Injectable()
export class RouteService {
  logger: any;
  // sequelize: any;
  constructor(
    @InjectModel(Route) private routeModel: typeof Route,
    @InjectModel(Location)
    private locationModel: typeof Location,
    private eventlogService: EventLogService,
    private readonly sequelize: Sequelize,
  ) {}
  async create(
    createRouteInput: CreateRouteInput,
    currentUser: any,
  ): Promise<GenericResponse<Route>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.routeModel,
        ['name'],
        createRouteInput,
        null,
        currentUser?.orgID,
      );

      handleErrors(validationErrors, 'unique');
      const route = await this.routeModel.create({
        ...createRouteInput,
        orgID: currentUser.orgID,
      });

      // Resolve zoneIDs to readable names for the log — same lookup
      // pattern already used in findAll()/findOne().
      const zoneLocations = await this.locationModel.findAll({
        where: { id: route.zoneIDs },
        attributes: ['id', 'name'],
      });
      const zoneNameMap = new Map(
        zoneLocations.map((loc) => [String(loc.id), loc.name]),
      );
      const zoneNamesJoined =
        route.zoneIDs
          ?.map((zid) => zoneNameMap.get(String(zid)) ?? `Zone ${zid}`)
          .join(', ') || 'N/A';

      const eventPayload = JSON.parse(JSON.stringify(createRouteInput));
      // Was payload: route — the full raw record. zoneIDs is an array,
      // and DetailTable's payloadJSON branch treats any object-typed
      // value as "look for .label", which arrays don't have, so it
      // rendered blank. Joined into a readable string of zone NAMES
      // instead of raw IDs — field renamed to zoneNames since it no
      // longer holds IDs.
      const eventLog = {
        objectType: 'Route',
        changeType: 'add',
        objectID: route.id,
        authID: currentUser.id,
        updatedBy: currentUser.name,
        payload: {
          id: route?.id,
          name: route?.name,
          zoneNames: zoneNamesJoined,
        },
        requestPayload: eventPayload,
        user: currentUser,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Route created successfully',
        data: route,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    routeFilterInput: RouteFilterInput,
    user: any,
  ): Promise<PaginatedList<Route>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = routeFilterInput;

      let whereClause: any = {};

      if (user?.orgID) {
        whereClause = {
          ...whereClause,
          orgID: user.orgID,
        };
      }

      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }

      const routes = await this.routeModel.findAndCountAll({
        attributes: ['name', 'id', 'zoneIDs'],
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      const allZoneIDs = [
        ...new Set(routes.rows.flatMap((route) => route.zoneIDs)),
      ];

      // Fetch locations for those zoneIDs
      const locations = await Location.findAll({
        where: { id: allZoneIDs },
        attributes: ['id', 'name'],
      });

      // Convert locations array into a map for quick lookup
      const locationMap = new Map(
        locations.map((loc) => [String(loc.id), loc.name]),
      );

      // Attach zone names to each route
      const updatedRoutes = routes.rows.map((route) => ({
        ...route.toJSON(),
        zones: route.zoneIDs.map((id) => ({
          id,
          name: locationMap.get(String(id)) || null,
        })),
      }));

      return {
        totalItems: routes.count,
        items: updatedRoutes,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<Route>> {
    try {
      const route = await this.routeModel.findOne({
        where: { id },
      });

      if (route) {
        const { zoneIDs } = route;
        const locations = await Location.findAll({
          where: {
            id: zoneIDs, // Matches IDs in the zoneIDs array
          },
          attributes: ['id', 'name'],
        });

        // Sort locations to match the order in the zoneIDs array
        const orderedLocations = zoneIDs.map((id) =>
          locations.find((location) => BigInt(location.id) === BigInt(id)),
        );

        // Add zones data to the route object
        const routeWithZones = { ...route.toJSON(), zones: orderedLocations };

        return {
          message: 'Route found',
          data: routeWithZones,
        };
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateRouteInput: UpdateRouteInput,
    user: any,
  ): Promise<any> {
    try {
      const { name } = updateRouteInput;
      const existingRoute = await this.routeModel.findOne({
        where: {
          name: name,
          id: { [Op.ne]: id },
        },
      });
      if (existingRoute) {
        throw new NotFoundException('A route with this name already exists.');
      }

      // Fetched BEFORE the update — the only point where the pre-update
      // name/zoneIDs are available to build a real Old/New diff from.
      const routeBeforeUpdate = await this.routeModel.findOne({
        where: { id },
      });

      const route = await this.routeModel.update(updateRouteInput, {
        where: { id },
        returning: true,
      });
      const updatedRoute = route?.[1]?.[0];

      // One combined lookup covering BOTH the old and new zoneIDs, so a
      // zone removed from the route still resolves to a real name in
      // the diff instead of falling back to "Zone <id>".
      const allZoneIDs = [
        ...new Set([
          ...(routeBeforeUpdate?.zoneIDs ?? []),
          ...(updatedRoute?.zoneIDs ?? []),
        ]),
      ];
      const zoneLocations = allZoneIDs.length
        ? await this.locationModel.findAll({
            where: { id: allZoneIDs },
            attributes: ['id', 'name'],
          })
        : [];
      const zoneNameMap = new Map(
        zoneLocations.map((loc) => [String(loc.id), loc.name]),
      );
      const joinZoneNames = (zoneIDs: any[] | undefined): string =>
        zoneIDs
          ?.map((zid) => zoneNameMap.get(String(zid)) ?? `Zone ${zid}`)
          .join(', ') || 'N/A';

      const oldZoneNamesJoined = joinZoneNames(routeBeforeUpdate?.zoneIDs);
      const newZoneNamesJoined = joinZoneNames(updatedRoute?.zoneIDs);

      // Real diff — only fields that actually changed get a row, and
      // zoneIDs is compared/displayed as resolved NAMES on both sides,
      // not raw ID arrays (which would hit the same blank-cell issue
      // fixed in create()/delete()).
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      if (routeBeforeUpdate?.name !== updatedRoute?.name) {
        changeJSON['name'] = {
          OldValue: routeBeforeUpdate?.name,
          newValue: updatedRoute?.name,
        };
      }
      if (oldZoneNamesJoined !== newZoneNamesJoined) {
        changeJSON['zoneNames'] = {
          OldValue: oldZoneNamesJoined,
          newValue: newZoneNamesJoined,
        };
      }

      const eventPayload = JSON.parse(JSON.stringify(updateRouteInput));
      const routeName = updatedRoute?.name ?? routeBeforeUpdate?.name;
      const eventLog = {
        objectType: 'Route',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        payload: {
          id: updatedRoute?.id,
          name: updatedRoute?.name,
          zoneNames: newZoneNamesJoined,
        },
        requestPayload: eventPayload,
        changeJSON,
        customDescription: `updated Route (${routeName})`,
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: 'Route updated successfully',
        data: updatedRoute,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async importRoutes(file: Buffer, user: any): Promise<object> {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const routesSheet = workbook.Sheets[workbook.SheetNames[0]];
    const zonesSheet = workbook.Sheets[workbook.SheetNames[1]];

    const zoneData: Array<{ Zone: string; GeoCode: string }> =
      XLSX.utils.sheet_to_json(zonesSheet);
    const routeData: Array<{ Route: string; Zones: string }> =
      XLSX.utils.sheet_to_json(routesSheet);

    const zonesToInsert = zoneData.map((row) => ({
      name: row.Zone,
      geoCode: row.GeoCode,
      orgID: user?.orgID,
    }));

    const transaction = await this.sequelize.transaction();
    try {
      const existingZones = await this.locationModel.findAll({
        where: {
          name: zonesToInsert.map((zone) => zone.name),
          orgID: user?.orgID,
        },
        transaction,
      });

      const existingZoneNames = existingZones.map((zone) => zone.name);
      const newZonesToInsert = zonesToInsert.filter(
        (zone) => !existingZoneNames.includes(zone.name),
      );

      let createdZones = [];
      if (newZonesToInsert.length > 0) {
        createdZones = await this.locationModel.bulkCreate(newZonesToInsert, {
          transaction,
          returning: true,
        });
      }
      // Create mapping of zone names to IDs
      const allZones = [...existingZones, ...createdZones];
      const zoneNameToIdMap = new Map(
        allZones.map((zone) => [zone.name, zone.id]),
      );

      // Check if any route references zones NOT in Sheet2
      const allZoneNamesInSheet2 = new Set(zoneData.map((row) => row.Zone));
      const invalidRoutes = routeData.filter((row) => {
        const zonesInRoute = row.Zones.replace(/[\[\]"]/g, '')
          .split(',')
          .map((z) => z.trim())
          .filter((z) => z);
        return zonesInRoute.some((zone) => !allZoneNamesInSheet2.has(zone));
      });

      if (invalidRoutes.length > 0) {
        const invalidZones = invalidRoutes.flatMap((r) =>
          r.Zones.replace(/[\[\]"]/g, '')
            .split(',')
            .map((z) => z.trim())
            .filter((z) => !allZoneNamesInSheet2.has(z)),
        );
        throw new Error(
          `The following zones in Routes (Sheet1) do not exist in Zones (Sheet2): ${[
            ...new Set(invalidZones),
          ].join(', ')}`,
        );
      }

      const routesToInsert = routeData.map((row) => ({
        name: row.Route,
        zoneIDs: row.Zones.replace(/[\[\]"]/g, '')
          .split(',')
          .map((z) => z.trim())
          .map((name) => zoneNameToIdMap.get(name)),
        orgID: user?.orgID,
      }));

      const existingRoutes = await this.routeModel.findAll({
        where: {
          name: routesToInsert.map((route) => route.name),
          orgID: user?.orgID,
        },
        transaction,
      });
      const existingRouteNames = existingRoutes.map((route) => route.name);
      const newRoutesToInsert = routesToInsert.filter(
        (route) => !existingRouteNames.includes(route.name),
      );

      let createdRoutes = [];
      if (newRoutesToInsert.length > 0) {
        createdRoutes = await this.routeModel.bulkCreate(
          newRoutesToInsert.map(({ name, orgID, zoneIDs }) => ({
            name,
            orgID,
            zoneIDs: zoneIDs,
          })),
          { transaction, returning: true },
        );
      }
      await transaction.commit();
      return {
        zones: { created: createdZones.length, existing: existingZones.length },
        routes: {
          created: createdRoutes.length,
          existing: existingRoutes.length,
        },
      };
    } catch (error) {
      await transaction.rollback();
      throw new BadRequestException(error.message);
    }
  }

  async delete(id: string, user: any): Promise<GenericResponse<null>> {
    try {
      // Was payload: '' — a literal empty string, so expanding this row
      // showed nothing. Fetched before destroy() so there's a real
      // snapshot of what was deleted. Same field trim and zoneIDs join
      // as create() — see its comment for why zoneIDs needs joining.
      const routeById = await this.routeModel.findOne({ where: { id } });

      // Resolve zoneIDs to readable names for the log — same lookup
      // pattern already used in findAll()/findOne().
      const zoneLocations = await this.locationModel.findAll({
        where: { id: routeById?.zoneIDs ?? [] },
        attributes: ['id', 'name'],
      });
      const zoneNameMap = new Map(
        zoneLocations.map((loc) => [String(loc.id), loc.name]),
      );
      const zoneNamesJoined =
        routeById?.zoneIDs
          ?.map((zid) => zoneNameMap.get(String(zid)) ?? `Zone ${zid}`)
          .join(', ') || 'N/A';

      const eventLog = {
        objectType: 'Route',
        changeType: 'delete',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        payload: {
          id: routeById?.id,
          name: routeById?.name,
          zoneNames: zoneNamesJoined,
        },
        requestPayload: id,
        user,
      };
      this.eventlogService.create(eventLog);
      await this.routeModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'Route deleted successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
