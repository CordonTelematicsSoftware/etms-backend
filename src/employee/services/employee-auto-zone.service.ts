import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Employee } from '../models/employee.model';
import { Location } from 'src/location-management/locations/models/location.model';
import { EmployeeType, Status } from 'src/shared/enums';
import { OrganizationService } from 'src/organization/services/organization.service';
import { GoogleMapsService } from 'src/google-maps/services/google-map-service';
import { EventLogService } from 'src/eventlog/eventlog.service';

@Injectable()
export class EmployeeAutoZoneService {
  logger: any;
  // sequelize: any;
  constructor(
    @InjectModel(Employee) private employeeModel: typeof Employee,
    @InjectModel(Location) private locationModel: typeof Location,
    private organizationService: OrganizationService,
    private googleMapsService: GoogleMapsService,
    private eventlogService: EventLogService,
  ) {}

  async EmployeeAutoZoneAssign(user: any): Promise<any> {
    const employees = await this.employeeModel.findAll({
      where: {
        status: Status.Active,
        orgID: user?.orgID,
        locationID: null,
        homePoint: { [Op.ne]: null },
        employeeType: EmployeeType.Employee,
      },
    });

    if (employees.length === 0) {
      throw new BadRequestException('No employees found without zones.');
    }

    const zones = await this.locationModel.findAll({
      where: {
        status: Status.Active,
        orgID: user?.orgID,
      },
    });
    if (zones.length === 0) {
      throw new BadRequestException('No active zones found.');
    }

    const organization = await this.organizationService.findOne(user?.orgID);

    const parseGeoCode = (geoCode: string): [number, number] | null => {
      if (!geoCode) return null;
      const [latStr, lonStr] = geoCode.split(',');
      const lat = parseFloat(latStr?.trim());
      const lon = parseFloat(lonStr?.trim());
      if (isNaN(lat) || isNaN(lon)) return null;
      return [lat, lon];
    };

    const getDistance = (
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number,
    ): number => {
      const toRad = (val: number): number => (val * Math.PI) / 180;
      const R = 6371; // Radius of Earth in KM
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const employeeDatas = [];

    for (const emp of employees) {
      const empCoords = parseGeoCode(emp.homePoint);
      if (!empCoords) continue;

      const zoneDistances = [];

      for (const zone of zones) {
        const zoneCoords = parseGeoCode(zone.geoCode);
        if (!zoneCoords) continue;

        const airDistance = getDistance(
          empCoords[0],
          empCoords[1],
          zoneCoords[0],
          zoneCoords[1],
        );

        zoneDistances.push({
          zone,
          airDistance,
          zoneName: zone.name,
          empName: emp.name,
        });
      }

      const top3Zones = zoneDistances
        .sort((a, b) => a.airDistance - b.airDistance)
        .slice(0, 2);

      let selectedZone = null;
      let commuteDistance = null;
      let commuteTime = null;
      let shortestCommute = Number.MAX_VALUE;

      for (const z of top3Zones) {
        const commute = await this.googleMapsService.getDistance(
          // z.zone.geoCode,
          organization?.data?.geoCode,
          emp.homePoint,
        );

        const commuteDistanceInMeters = this.parseDistanceToMeters(
          commute.distance,
        );

        if (commuteDistanceInMeters < shortestCommute) {
          selectedZone = z.zone;
          commuteDistance = commute.distance;
          commuteTime = commute.time;
          shortestCommute = commute.distance;
        }
      }
      if (selectedZone) {
        await this.employeeModel.update(
          {
            locationID: selectedZone.id,
            commuteDistance,
            commuteTime,
          },
          { where: { id: emp.id } },
        );
      }
    }
    const eventLog = {
      objectType: 'Employee Auto Zone',
      changeType: 'add',
      objectID: organization.data.id,
      authID: user.id,
      orgID: user?.orgID,
      updatedBy: user.name,
      payload: employeeDatas,
      requestPayload: null,
      user,
    };
    await this.eventlogService.create(eventLog);
    return {
      success: true,
      message: 'Employees auto-assigned to nearest zones.',
    };
  }

  parseDistanceToMeters(distanceStr: string): number {
    if (!distanceStr) return Number.MAX_VALUE;

    const lower = distanceStr.toLowerCase().trim();

    if (lower.endsWith('km')) {
      return parseFloat(lower.replace('km', '').trim()) * 1000;
    } else if (lower.endsWith('m')) {
      return parseFloat(lower.replace('m', '').trim());
    }

    return Number.MAX_VALUE; // fallback in case format is unknown
  }
}
