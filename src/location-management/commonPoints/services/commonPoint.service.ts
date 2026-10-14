import {
  BadRequestException,
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
import { UpdateCommonPointInput } from '../dtos/update-commonpoint.input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Sequelize } from 'sequelize-typescript';
import { CreateCommonPointInput } from '../dtos/create-commonPoint-input.dto';
import { CommonPointFilterInput } from '../dtos/commonPoint-filter-input.dto';
import { CommonPoint } from '../models/commonPoint.model';
import { EmployeeService } from 'src/employee/services/employee-service';
import { Op } from 'sequelize';
import { EventLogService } from 'src/eventlog/eventlog.service';
import * as XLSX from 'xlsx';

@Injectable()
export class CommonPointService {
  private logger = new Logger(CommonPointService.name);
  constructor(
    @InjectModel(CommonPoint)
    private commonPointModel: typeof CommonPoint,
    private readonly sequelize: Sequelize,
    private employeeService: EmployeeService,
    private eventlogService: EventLogService,
  ) {}

  async create(
    createCommonPointInput: CreateCommonPointInput,
    user: any,
  ): Promise<GenericResponse<CommonPoint>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.commonPointModel,
        ['name'],
        createCommonPointInput,
        null,
        user?.orgID,
      );

      handleErrors(validationErrors, 'unique');
      const commonPoint = await this.commonPointModel.create({
        ...createCommonPointInput,
        orgID: user.orgID,
      });
      const eventPayload = JSON.parse(JSON.stringify(createCommonPointInput));
      const eventLog = {
        objectType: 'Common Point',
        changeType: 'add',
        objectID: commonPoint.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: commonPoint,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Common Point created successfully',
        data: commonPoint,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAll(
    commonPointFilterInput: CommonPointFilterInput,
    user: any,
  ): Promise<PaginatedList<CommonPoint>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        search,
        sortOrder = SortOrder.ASC,
      } = commonPointFilterInput;
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
      }
      const commonPoint = await this.commonPointModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,
      });
      return {
        totalItems: commonPoint.count,
        items: commonPoint.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllCommonPoints(user: any): Promise<PaginatedList<CommonPoint>> {
    try {
      const whereClause: any = {};

      if (user) {
        whereClause.orgID = user.orgID;
      }
      const commonPoint = await this.commonPointModel.findAndCountAll({
        where: whereClause,
      });
      return {
        totalItems: commonPoint.count,
        items: commonPoint.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllActiveCommonPoints(
    commonPointFilterInput: CommonPointFilterInput,
    user: any,
  ): Promise<PaginatedList<CommonPoint>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        search,
        sortOrder = SortOrder.ASC,
      } = commonPointFilterInput;
      let whereClause: any = {};

      if (user) {
        whereClause.orgID = user?.orgID;
      }
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
      const commonPoint = await this.commonPointModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,
      });
      return {
        totalItems: commonPoint.count,
        items: commonPoint.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string, user: any): Promise<GenericResponse<CommonPoint>> {
    try {
      const whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.id = id;
      const commonPoint = await this.commonPointModel.findOne({
        where: whereClause,
      });
      if (commonPoint)
        return {
          message: 'CommonPoint found',
          data: commonPoint,
        };
      else throw new NotFoundException('Common point not found');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateCommonPointInput: UpdateCommonPointInput,
    user: any,
  ): Promise<any> {
    try {
      const commonPointById = await this.findOne(id, user);
      const validationErrors = await uniqueFieldsCheck(
        this.commonPointModel,
        ['name'],
        updateCommonPointInput,
        id,
        user?.orgID,
      );

      handleErrors(validationErrors, 'unique');
      const commonPoint = await this.commonPointModel.update(
        updateCommonPointInput,
        {
          where: { id },
          returning: true,
        },
      );
      const eventPayload = JSON.parse(JSON.stringify(updateCommonPointInput));
      const eventLog = {
        objectType: 'Common Point',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: commonPointById.data,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        status: true,
        message: 'Common Point updated successfully',
        data: commonPoint?.[1]?.[0],
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
      const commonPointExists =
        await this.employeeService.findEmployeeWithCommonPoint(id);

      if (commonPointExists) {
        throw new BadRequestException(
          'Deletion is not permitted as there are employees currently associated with this common point.',
        );
      } else {
        const eventLog = {
          objectType: 'Common Point',
          changeType: 'delete',
          objectID: id,
          authID: user.id,
          orgID: user.orgID,
          updatedBy: user.name,
          payload: '',
          requestPayload: id,
          user,
        };
        this.eventlogService.create(eventLog);
        const response = await this.commonPointModel.destroy({
          where: {
            id,
          },
        });
        if (response !== 0) {
          return {
            message: 'Common point deleted successfully',
            data: null,
          };
        } else throw new NotFoundException(`Common point not found`);
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async importCommonPoints(file: Buffer, user: any): Promise<object> {
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

      const employeeCount = sheetData.length - 1; // Subtract 1 for header row
      if (employeeCount > 200) {
        throw new BadRequestException(
          `You cannot upload more than 200 common points at once. Your file contains ${employeeCount} common points.`,
        );
      }

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
        validatedData = await this.validateCommonPointSheetData(
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
        const createCommonPoints = await this.commonPointModel.bulkCreate(
          validatedData.map((data) => ({
            name: data.name,
            geoCode: data.geoCode,
            status: Status.Active,
            orgID: user?.orgID,
          })),
          { transaction },
        );
        await transaction.commit();
        return {
          message: `${createCommonPoints.length} Common Points were created successfully.`,
          data: createCommonPoints,
        };
      } catch (error) {
        await transaction.rollback();
        throw new BadRequestException(`Import failed: ${error.message}`);
      }
    } catch (error) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  private async validateCommonPointSheetData(
    sheetData: any[],
    user: any,
  ): Promise<any[]> {
    const errors: string[] = [];
    const validatedData: any[] = [];
    const commonPointNames = sheetData.map((row) => row.Name?.trim() || '');
    const geocodes = sheetData.map((row) => row.Geocode?.trim() || '');

    const findDuplicates = (arr: string[]) =>
      arr.filter((item, index) => arr.indexOf(item) !== index);

    const duplicateCommonPointNames = findDuplicates(commonPointNames);
    const duplicateGeocodes = findDuplicates(geocodes);

    if (duplicateCommonPointNames.length > 0) {
      errors.push(
        `Duplicate zone names: ${duplicateCommonPointNames.join(', ')}`,
      );
    }
    if (duplicateGeocodes.length > 0) {
      errors.push(`Duplicate geocodes: ${duplicateGeocodes.join(', ')}`);
    }

    const existingRecords = await this.commonPointModel.findAll({
      where: {
        orgID: user.orgID,
        [Op.or]: [
          { name: { [Op.in]: commonPointNames } },
          { geoCode: { [Op.in]: geocodes } },
        ],
      },
    });
    if (existingRecords.length > 0) {
      const duplicateDetails = existingRecords.map((record) => {
        const fields = [];
        if (commonPointNames.includes(record.name))
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
