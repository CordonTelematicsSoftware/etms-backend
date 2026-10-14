import {
  BadRequestException,
  // BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { SortOrder, Status } from 'src/shared/enums';
import { UpdateLocationInput } from '../dtos/update-location-input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Sequelize } from 'sequelize-typescript';
import { CreateLocationInput } from '../dtos/create-location-input.dto';
import { LocationFilterInput } from '../dtos/location-filter-input.dto';
import { Location } from '../models/location.model';
import { EmployeeService } from 'src/employee/services/employee-service';
import { Op } from 'sequelize';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Employee } from 'src/employee/models/employee.model';
import { Route } from 'src/routes/models/route.model';
import sequelize from 'sequelize';
import * as XLSX from 'xlsx';

@Injectable()
export class LocationService {
  private logger = new Logger(LocationService.name);
  constructor(
    @InjectModel(Location)
    private locationModel: typeof Location,
    @InjectModel(Route)
    private routeModel: typeof Route,
    private readonly sequelize: Sequelize,
    private employeeService: EmployeeService,
    private eventlogService: EventLogService,
  ) {}

  async create(
    createLocationInput: CreateLocationInput,
    user: any,
  ): Promise<GenericResponse<Location>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.locationModel,
        ['name'],
        createLocationInput,
        null,
        user?.orgID,
      );

      handleErrors(validationErrors, 'unique');

      const location = await this.locationModel.create({
        ...createLocationInput,
        tripTime: createLocationInput?.tripTime || null,
        orgID: user?.orgID,
      });

      const eventPayload = JSON.parse(JSON.stringify(createLocationInput));
      // Was payload: location — the full raw record, so expanding this
      // row listed orgID/isLocked alongside everything else. Trimmed to
      // the fields relevant to what was created.
      const eventLog = {
        objectType: 'Location',
        changeType: 'add',
        objectID: location.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: {
          id: location?.id,
          name: location?.name,
          geoCode: location?.geoCode,
          tripTime: location?.tripTime,
        },
        requestPayload: eventPayload,
        customDescription: 'created new Zone',
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Location created successfully',
        data: location,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAll(
    locationFilterInput: LocationFilterInput,
    user: any,
  ): Promise<PaginatedList<Location>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        search,
        sortOrder = SortOrder.DESC,
      } = locationFilterInput;
      let whereClause: any = {};

      if (user) {
        whereClause.orgID = user.orgID;
      }

      if (search) {
        whereClause = {
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
        whereClause.orgID = user.orgID;
      }
      const location = await this.locationModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,
      });
      return {
        totalItems: location.count,
        items: location.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string, user: any): Promise<GenericResponse<Location>> {
    try {
      const whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.id = id;
      const location = await this.locationModel.findOne({
        where: whereClause,
      });
      if (location)
        return {
          message: 'Location found',
          data: location,
        };
      else throw new NotFoundException('Location not found');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateLocationInput: UpdateLocationInput,
    user: any,
  ): Promise<any> {
    try {
      const locationById = await this.findOne(id, user);
      const validationErrors = await uniqueFieldsCheck(
        this.locationModel,
        ['name'],
        updateLocationInput,
        id,
        user?.orgID,
      );
      handleErrors(validationErrors, 'unique');
      const location = await this.locationModel.update(
        {
          ...updateLocationInput,
          tripTime: updateLocationInput?.tripTime || null,
        },
        {
          where: { id },
          returning: true,
        },
      );

      // Built explicitly against locationById.data (fetched pre-update)
      // rather than relying on EventLogService's generic auto-diff — was
      // showing "updated 4 fields" (every key sent in the request) even
      // when only 2 actually changed, since the description text was
      // never tied to the real diff, only to the request payload size.
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      for (const key of Object.keys(updateLocationInput)) {
        const oldValue = (locationById.data as any)?.[key];
        const newValue = (updateLocationInput as any)[key];
        if (oldValue !== newValue) {
          changeJSON[key] = { OldValue: oldValue, newValue };
        }
      }

      const eventPayload = JSON.parse(JSON.stringify(updateLocationInput));
      const fieldCount = Object.keys(changeJSON).length;
      const zoneName = updateLocationInput?.name ?? locationById.data?.name;
      const eventLog = {
        objectType: 'Location',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: locationById.data,
        requestPayload: eventPayload,
        changeJSON,
        customDescription:
          fieldCount > 1
            ? `updated ${fieldCount} fields in Zone (${zoneName})`
            : `updated Zone (${zoneName})`,
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        status: true,
        message: 'Location updated successfully',
        data: location?.[1]?.[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async softDelete(id: string, user: any): Promise<GenericResponse<null>> {
    try {
      const locationInRoute = await this.routeModel.findOne({
        where: {
          zoneIDs: {
            [sequelize.Op.contains]: [parseInt(id)],
          },
        },
      });
      const locationExists =
        await this.employeeService.findEmployeeWithLocation(id);

      if (locationExists) {
        await this.employeeService.deleteLocationIdOfEmployees(id);

        // throw new BadRequestException(
        //   'Deletion is not permitted as the location is currently used.',
        // );
      }
      if (locationInRoute) {
        // Remove the ID from the array
        locationInRoute.zoneIDs = locationInRoute.zoneIDs.filter(
          (zoneID) => zoneID !== Number(id),
        );

        // Save the updated record
        await locationInRoute.save();
        // throw new NotFoundException(
        //   'Cannot delete zone as it is being used by one or more organizations.',
        // );
      }
      const locationById = await this.findOne(id, user);
      // Was payload: locationById.data — the full raw record, so
      // expanding this row listed orgID/status alongside everything
      // else. Trimmed to the fields relevant to what was deleted.
      const eventLog = {
        objectType: 'Location',
        changeType: 'delete',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: {
          id: locationById.data?.id,
          name: locationById.data?.name,
          geoCode: locationById.data?.geoCode,
          // isLocked: locationById.data?.isLocked,
          tripTime: locationById.data?.tripTime,
        },
        requestPayload: id,
        customDescription: `removed Zone (${locationById.data?.name})`,
        user,
      };
      this.eventlogService.create(eventLog);
      const response = await this.locationModel.destroy({
        where: {
          id,
        },
      });
      if (response !== 0) {
        return {
          message: 'Location deleted successfully',
          data: null,
        };
      } else throw new NotFoundException(`Location not found`);
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getAllZones(
    locationFilterInput: LocationFilterInput,
    user: any,
  ): Promise<PaginatedList<Location>> {
    try {
      const { search } = locationFilterInput;
      let whereClause: any = {};

      // if (user) {
      whereClause.orgID = user.orgID;
      // }
      whereClause.status = Status?.Active;
      if (search) {
        whereClause = {
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }
      const location = await this.locationModel.findAndCountAll({
        where: whereClause,
        attributes: ['id', 'name', 'geoCode'],
      });
      return {
        totalItems: location.count,
        items: location.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getAllZonesForEmployees(
    locationFilterInput: LocationFilterInput,
    user: any,
  ): Promise<PaginatedList<Location>> {
    try {
      const { search } = locationFilterInput;
      let whereClause: any = {};

      // if (user) {
      whereClause.orgID = user.orgID;
      // }
      whereClause.status = Status?.Active;
      if (search) {
        whereClause = {
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
        whereClause.orgID = user.orgID;
      }
      const location = await this.locationModel.findAndCountAll({
        where: whereClause,
        attributes: ['id', 'name', 'geoCode'],
      });
      return {
        totalItems: location.count,
        items: location.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findZonesWithEmployee(user: any): Promise<Location[]> {
    try {
      await this.employeeService.calculateEmployeeComiuteDistance(user);

      const whereClause: any = {};

      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.status = Status?.Active;
      // const locations = await Location.findAll({
      //   where: whereClause,
      //   include: [
      //     {
      //       model: Employee,
      //       as: 'employees',
      //       attributes: [
      //         'id',
      //         'name',
      //         'employeeCode',
      //         'designation',
      //         'address',
      //         'locationID',
      //         'commuteDistance',
      //         'sortOrder',
      //       ],
      //     },
      //   ],
      //   order: [
      //     ['id', 'ASC'], // Location order
      //     [{ model: Employee, as: 'employees' }, 'sortOrder', 'ASC'], // Employee order inside each Location
      //   ],
      // });

      const locations = await Location.findAll({
        where: whereClause,
        include: [
          {
            model: Employee,
            as: 'employees',
            required: false,
            where: {
              orgID: user.orgID, // Filter employees by orgID
            },
            attributes: [
              'id',
              'name',
              'employeeCode',
              'designation',
              'address',
              'locationID',
              'commuteDistance',
              'sortOrder',
              'homePoint',
            ],
          },
        ],
        order: [['id', 'ASC']], // Sort locations only
      });

      // Manually sort employees per location
      for (const location of locations) {
        const allHaveSortOrder = location.employees.every(
          (emp) => emp.sortOrder !== null && emp.sortOrder !== undefined,
        );

        if (allHaveSortOrder) {
          location.employees.sort(
            (a, b) => Number(a.sortOrder) - Number(b.sortOrder),
          );
        } else {
          location.employees.sort((a, b) => {
            const distA = parseFloat(a.commuteDistance);
            const distB = parseFloat(b.commuteDistance);
            return distB - distA; // Descending
          });
        }
      }

      return locations;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findZonesWithEmployeeWithDistance(user: any): Promise<Location[]> {
    try {
      const whereClause: any = {};

      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.status = Status?.Active;
      // const location = await this.locationModel.findAndCountAll({
      //   where: whereClause,
      //   attributes: ['id', 'name'],
      // });
      const locations = await Location.findAll({
        where: whereClause,
        include: [
          {
            model: Employee,
            as: 'employees',
            attributes: [
              'id',
              'name',
              'employeeCode',
              'designation',
              'address',
              'locationID',
              'commuteDistance',
              'sortOrder',
            ],
          },
        ],
        order: [
          ['id', 'ASC'],
          [
            Sequelize.literal(
              `CAST(SPLIT_PART("employees"."commuteDistance", ' ', 1) AS FLOAT)`,
            ),
            'DESC',
          ],
        ],
      });

      return locations;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async importZones(file: Buffer, user: any): Promise<object> {
    try {
      this.logger.log('import service---', file);
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
      });

      if (!sheetData?.length) {
        throw new BadRequestException('The Excel file is empty.');
      }

      // const employeeCount = sheetData.length - 1; // Subtract 1 for header row
      // if (employeeCount > 200) {
      //   throw new BadRequestException(
      //     `You cannot upload more than 200 zones at once. Your file contains ${employeeCount} zones.`,
      //   );
      // }

      const headers = sheetData[0] as string[];
      const requiredHeaders = ['Name', 'Geocode'];
      const missingHeaders = requiredHeaders.filter(
        (header) => !headers.includes(header),
      );

      if (missingHeaders.length > 0) {
        throw new BadRequestException(
          `The Excel file is missing the following required headers: ${missingHeaders.join(
            ', ',
          )}.`,
        );
      }

      const sheetDataObjects: any = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        { raw: false },
      );

      if (!sheetDataObjects?.length) {
        throw new BadRequestException(
          'The Excel file contains no valid data rows.',
        );
      }
      let validatedData: any = null;
      try {
        validatedData = await this.validateZoneSheetData(
          sheetDataObjects,
          user,
        );
      } catch (error) {
        throw new BadRequestException(
          `Data validation failed: ${error.message}`,
        );
      }
      const transaction = await this.sequelize.transaction();
      try {
        const createEmployees = await this.locationModel.bulkCreate(
          validatedData.map((data) => ({
            name: data.name,
            geoCode: data.geoCode,
            status: Status.Active,
            orgID: user?.orgID,
          })),
          { transaction },
        );
        // const eventLog = {
        //   objectType: 'Zones',
        //   changeType: 'import',
        //   objectID: '',
        //   authID: user.id,
        //   orgID: user.orgID,
        //   updatedBy: user.name,
        //   payload: '',
        //   requestPayload: '',
        // };
        // console.log('createEmployees----', eventLog);

        // this.eventlogService.create(eventLog);
        await transaction.commit();

        return {
          message: `${createEmployees.length} Zones were created successfully.`,
          data: createEmployees,
        };
      } catch (error) {
        await transaction.rollback();
        throw new BadRequestException(`Import failed: ${error.message}`);
      }
    } catch (error) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  private async validateZoneSheetData(
    sheetData: any[],
    user: any,
  ): Promise<any[]> {
    const errors: string[] = [];
    const validatedData: any[] = [];
    const zoneNames = sheetData.map((row) => row.Name.trim());
    const geocodes = sheetData.map((row) => row.Geocode.trim());

    const findDuplicates = (arr: string[]) =>
      arr.filter((item, index) => arr.indexOf(item) !== index);

    const duplicateZoneNames = findDuplicates(zoneNames);
    const duplicateGeocodes = findDuplicates(geocodes);

    if (duplicateZoneNames.length > 0) {
      errors.push(`Duplicate zone names: ${duplicateZoneNames.join(', ')}`);
    }
    if (duplicateGeocodes.length > 0) {
      errors.push(`Duplicate geocodes: ${duplicateGeocodes.join(', ')}`);
    }

    const existingRecords = await this.locationModel.findAll({
      where: {
        orgID: user.orgID,
        [Op.or]: [
          { name: { [Op.in]: zoneNames } },
          { geoCode: { [Op.in]: geocodes } },
        ],
      },
    });
    if (existingRecords.length > 0) {
      const duplicateDetails = existingRecords.map((record) => {
        const fields = [];
        if (zoneNames.includes(record.name))
          fields.push(`Name: ${record.name}`);
        if (geocodes.includes(record.geoCode))
          fields.push(`Geocode: ${record.geoCode}`);
        return fields.join(', ');
      });
      throw new BadRequestException(
        `The following records already exist:\n${duplicateDetails.join('\n')}`,
      );
    }
    for (let index = 0; index < sheetData.length; index++) {
      const row = sheetData[index];
      const rowErrors: string[] = [];
      // const { Name, Geocode } = row;
      const Name = row.Name ? row.Name.trim() : '';
      const Geocode = row.Geocode ? row.Geocode.trim() : '';
      if (!Name) rowErrors.push('Name is required');
      if (!Geocode) rowErrors.push('Geocode is required');

      const homePointRegex =
        /^([-+]?([1-8]?\d(\.\d{1,20})?|90(\.0{1,20})?)),\s*([-+]?((1[0-7]\d|[1-9]?\d)(\.\d{1,20})?|180(\.0{1,20})?))$/;
      if (Geocode && !homePointRegex.test(Geocode)) {
        rowErrors.push(
          "Invalid Geocode format (must be 'latitude, longitude')",
        );
      }

      if (rowErrors.length > 0) {
        errors.push(`Row ${index + 2}: ${rowErrors.join(', ')}`);
      } else {
        validatedData.push({
          name: Name,
          geoCode: Geocode,
          status: Status.Active,
          orgID: user?.orgID,
        });
      }
    }
    if (errors.length > 0) {
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }
    return validatedData;
  }
}
