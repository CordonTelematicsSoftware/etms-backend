import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SortOrder } from 'src/shared/enums';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import * as XLSX from 'xlsx';
// import {  Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Status } from 'src/shared/enums';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Op } from 'sequelize';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Security } from '../models/security.model';
import { CreateSecurityInput } from '../dtos/create-security-input.dto';
import { SecurityFilterInput } from '../dtos/security-filter-input.dto';
import { UpdateSecurityInput } from '../dtos/update-security-input.dto';

@Injectable()
export class SecurityService {
  private logger = new Logger(SecurityService.name);
  constructor(
    @InjectModel(Security)
    private securityModel: typeof Security,
    private eventlogService: EventLogService,
    private readonly sequelize: Sequelize,
  ) {}

  async create(
    createSecurityInput: CreateSecurityInput,
    currentUser?: any,
  ): Promise<GenericResponse<Security>> {
    try {
      const phone1 = createSecurityInput.phone1?.toString().trim();
      const phone2 = createSecurityInput.phone2?.toString().trim();

      // 1. Same record check
      if (phone1 && phone2 && phone1 === phone2) {
        throw new BadRequestException(
          'Phone number 1 and Phone number 2 cannot be the same',
        );
      }

      // 2. Unique check for phone1 across phone1 + phone2 fields
      if (phone1) {
        const existsPhone1 = await this.securityModel.findOne({
          where: {
            orgID: currentUser?.orgID,
            [Op.or]: [{ phone1: phone1 }, { phone2: phone1 }],
          },
        });

        if (existsPhone1) {
          throw new BadRequestException(
            `Phone number ${phone1} is already assigned to another security`,
          );
        }
      }

      // 3. Unique check for phone2 across phone1 + phone2 fields
      if (phone2) {
        const existsPhone2 = await this.securityModel.findOne({
          where: {
            orgID: currentUser?.orgID,
            [Op.or]: [{ phone1: phone2 }, { phone2: phone2 }],
          },
        });

        if (existsPhone2) {
          throw new BadRequestException(
            `Phone number ${phone2} is already assigned to another security`,
          );
        }
      }

      const validationErrors = await uniqueFieldsCheck(
        this.securityModel,
        ['phone1', 'phone2', 'securityCode', 'aadharNumber'],
        createSecurityInput,
        null,
        currentUser?.orgID,
      );

      handleErrors(validationErrors, 'unique');

      const securities = await this.securityModel.create({
        ...createSecurityInput,
        orgID: currentUser?.orgID,
        createdBy: currentUser.id,
      });

      // Formats a date as DD/MM/YYYY, date-only.
      const formatDateOnly = (value: any): any => {
        if (!value) return value;
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      };

      const eventPayload = JSON.parse(JSON.stringify(createSecurityInput));
      // Was payload: securities — the raw model instance, so dob
      // rendered as the raw stored value instead of a formatted date.
      const eventLog = {
        objectType: 'Security',
        changeType: 'add',
        objectID: securities.id,
        authID: currentUser.id,
        orgID: currentUser?.orgID,
        updatedBy: currentUser.name,
        payload: {
          ...securities.get({ plain: true }),
          dob: formatDateOnly(securities.dob),
        },
        requestPayload: eventPayload,
        user: currentUser,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Security created successfully',
        data: securities,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async importSecurities(file: Buffer, user: any): Promise<object> {
    try {
      this.logger.log('Processing security bulk import for org:', user.orgID);
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
      });

      if (!sheetData?.length) {
        throw new BadRequestException('The Excel file is empty.');
      }

      const securityCount = sheetData.length - 1; // Subtract 1 for header row
      if (securityCount > 200) {
        throw new BadRequestException(
          `You cannot upload more than 200 securities at once. Your file contains ${securityCount} securities.`,
        );
      }

      const headers = sheetData[0] as string[];
      const requiredHeaders = [
        'Name',
        'SecurityCode',
        'Gender',
        'Phone1',
        'Phone2',
        'Address',
        'DOB',
        'BloodGroup',
        'EmergencyContactNo',
        'EmergencyContactName',
        'AadharNumber',
      ];

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
        validatedData = await this.validateSecuritySheetData(
          sheetDataObjects,
          user,
        );
      } catch (error) {
        throw new BadRequestException(
          `Data validation failed: ${error.message}`,
        );
      }

      // Check for existing records
      try {
        const existingRecords = await this.securityModel.findAll({
          where: {
            orgID: user.orgID,
            [Op.or]: [
              { phone1: { [Op.in]: validatedData.map((data) => data.phone1) } },
              { phone2: { [Op.in]: validatedData.map((data) => data.phone2) } },
              {
                securityCode: {
                  [Op.in]: validatedData.map((data) => data.securityCode),
                },
              },
              {
                aadharNumber: {
                  [Op.in]: validatedData.map((data) => data.aadharNumber),
                },
              },
            ],
          },
        });

        if (existingRecords.length > 0) {
          const duplicateDetails = existingRecords.map((record) => {
            const fields = [];
            if (validatedData.some((data) => data.phone1 === record.phone1))
              fields.push(`Phone1: ${record.phone1}`);
            if (validatedData.some((data) => data.phone2 === record.phone2))
              fields.push(`Phone2: ${record.phone2}`);
            if (
              validatedData.some(
                (data) => data.securityCode === record.securityCode,
              )
            )
              fields.push(`SecurityCode: ${record.securityCode}`);
            if (
              validatedData.some(
                (data) => data.aadharNumber === record.aadharNumber,
              )
            )
              fields.push(`AadharNumber: ${record.aadharNumber}`);
            return fields.join(', ');
          });
          throw new BadRequestException(
            `The following records already exist:\n${duplicateDetails.join(
              '\n',
            )}`,
          );
        }
      } catch (error) {
        throw new BadRequestException(`Import failed: ${error.message}`);
      }

      const transaction = await this.sequelize.transaction();
      try {
        const createdSecurities = await this.securityModel.bulkCreate(
          validatedData.map((data) => ({
            name: data.name,
            securityCode: data.securityCode,
            phone1: data.phone1,
            phone2: data.phone2,
            gender: data.gender,
            address: data.address,
            dob: data.dob,
            bloodGroup: data.bloodGroup,
            emergencyContactNo: data.emergencyContactNo,
            emergencyContactName: data.emergencyContactName,
            aadharNumber: data.aadharNumber,
            orgID: user.orgID,
            status: Status.Active,
            createdBy: user.id,
          })),
          { transaction },
        );

        await transaction.commit();

        return {
          message: `${createdSecurities.length} Securities were created successfully.`,
          data: createdSecurities,
        };
      } catch (error) {
        await transaction.rollback();
        throw new BadRequestException(`Import failed: ${error.message}`);
      }
    } catch (error) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  private async validateSecuritySheetData(
    sheetData: any[],
    user: any,
  ): Promise<any[]> {
    const errors: string[] = [];
    const validatedData: any[] = [];
    const securityCodes = sheetData.map(
      (row) => row.SecurityCode?.trim() || '',
    );
    const phone1Numbers = sheetData.map((row) => row.Phone1?.trim() || '');
    const phone2Numbers = sheetData.map((row) => row.Phone2?.trim() || '');
    const aadharNumbers = sheetData.map(
      (row) => row.AadharNumber?.trim() || '',
    );

    const findDuplicates = (arr: string[]) =>
      arr.filter((item, index) => arr.indexOf(item) !== index);

    const duplicateSecurityCodes = findDuplicates(securityCodes);
    const duplicatePhone1s = findDuplicates(phone1Numbers);
    const duplicatePhone2s = findDuplicates(phone2Numbers);
    const duplicateAadhars = findDuplicates(aadharNumbers);

    if (duplicateSecurityCodes.length > 0) {
      errors.push(
        `Duplicate security codes: ${duplicateSecurityCodes.join(', ')}`,
      );
    }
    if (duplicatePhone1s.length > 0) {
      errors.push(`Duplicate phone1 numbers: ${duplicatePhone1s.join(', ')}`);
    }
    if (duplicatePhone2s.length > 0) {
      errors.push(`Duplicate phone2 numbers: ${duplicatePhone2s.join(', ')}`);
    }
    if (duplicateAadhars.length > 0) {
      errors.push(`Duplicate Aadhar numbers: ${duplicateAadhars.join(', ')}`);
    }

    for (let index = 0; index < sheetData.length; index++) {
      const row = sheetData[index];
      const rowErrors: string[] = [];

      // const {
      //   Name,
      //   SecurityCode,
      //   Gender,
      //   Phone1,
      //   Phone2,
      //   Address,
      //   DOB,
      //   BloodGroup,
      //   EmergencyContactNo,
      //   EmergencyContactName,
      //   AadharNumber,
      // } = row;

      const Name = (row.Name || '').trim();
      const SecurityCode = (row.SecurityCode || '').trim();
      const Gender = (row.Gender || '').trim();
      const Phone1 = (row.Phone1 || '').toString().trim();
      const Phone2 = (row.Phone2 || '').toString().trim();
      const Address = (row.Address || '').trim();
      const DOB = (row.DOB || '').trim();
      const BloodGroup = (row.BloodGroup || '').trim();
      const EmergencyContactNo = (row.EmergencyContactNo || '')
        .toString()
        .trim();
      const EmergencyContactName = (row.EmergencyContactName || '').trim();
      const AadharNumber = (row.AadharNumber || '').trim();

      // Required field validation
      if (!Name) rowErrors.push('Name is required');
      if (!SecurityCode) rowErrors.push('SecurityCode is required');
      if (!Gender) rowErrors.push('Gender is required');
      if (!Phone1) rowErrors.push('Phone1 is required');
      if (!Phone2) rowErrors.push('Phone2 is required');
      if (!Address) rowErrors.push('Address is required');
      if (!DOB) rowErrors.push('DOB is required');
      if (!BloodGroup) rowErrors.push('BloodGroup is required');
      if (!EmergencyContactNo) rowErrors.push('EmergencyContactNo is required');
      if (!EmergencyContactName)
        rowErrors.push('EmergencyContactName is required');
      if (!AadharNumber) rowErrors.push('AadharNumber is required');

      // Phone validation (10 digits)
      if (Phone1 && !/^[0-9]{10}$/.test(Phone1)) {
        rowErrors.push('Phone1 must be 10 digits');
      }
      if (Phone2 && !/^[0-9]{10}$/.test(Phone2)) {
        rowErrors.push('Phone2 must be 10 digits');
      }

      // Aadhar validation (12 digits)
      if (AadharNumber && !/^[0-9]{12}$/.test(AadharNumber)) {
        rowErrors.push('AadharNumber must be 12 digits');
      }

      // Gender validation
      const validGenders = ['Male', 'Female', 'Other'];
      if (Gender && !validGenders.includes(Gender)) {
        rowErrors.push('Gender must be Male, Female, or Other');
      }

      // DOB validation (should be valid date and person should be 18+)
      if (DOB) {
        const dobDate = new Date(DOB);
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        const monthDiff = today.getMonth() - dobDate.getMonth();

        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < dobDate.getDate())
        ) {
          age--;
        }

        if (age < 18) {
          rowErrors.push('Security personnel must be at least 18 years old');
        }
      }

      // Blood group validation
      const validBloodGroups = [
        'A+',
        'A-',
        'B+',
        'B-',
        'AB+',
        'AB-',
        'O+',
        'O-',
      ];
      if (BloodGroup && !validBloodGroups.includes(BloodGroup)) {
        rowErrors.push('Invalid blood group format');
      }

      if (rowErrors.length > 0) {
        errors.push(`Row ${index + 2}: ${rowErrors.join(', ')}`);
      } else {
        validatedData.push({
          name: Name,
          securityCode: SecurityCode,
          phone1: Phone1,
          phone2: Phone2,
          gender: Gender,
          address: Address,
          dob: new Date(DOB),
          bloodGroup: BloodGroup,
          emergencyContactNo: EmergencyContactNo,
          emergencyContactName: EmergencyContactName,
          aadharNumber: AadharNumber,
          orgID: user?.orgID,
        });
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }

    return validatedData;
  }

  async findAll(
    securityFilterInput: SecurityFilterInput,
    user: any,
  ): Promise<PaginatedList<Security>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        status,
      } = securityFilterInput;

      let whereClause: any = {};

      whereClause.orgID = user?.orgID;
      if (status) {
        whereClause.status = 'Active';
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
            {
              phone1: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              phone2: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              address: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }

      const securities = await this.securityModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      return {
        totalItems: securities.count,
        items: securities.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string, user?: any): Promise<GenericResponse<Security>> {
    try {
      const whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.id = id;
      const security = await this.securityModel.findOne({
        where: whereClause,
      });
      if (security)
        return {
          message: 'Security found',
          data: security,
        };
      else throw new NotFoundException('Security not found');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateSecurityInput: UpdateSecurityInput,
    user: any,
  ): Promise<any> {
    try {
      const security = await this.securityModel.findOne({
        where: { id: id },
      });

      if (!security) {
        throw new NotFoundException('Security not found');
      }
      const phone1 = updateSecurityInput.phone1?.toString().trim();
      const phone2 = updateSecurityInput.phone2?.toString().trim();

      // 1. Same record uniqueness (phone1 !== phone2)
      if (phone1 && phone2 && phone1 === phone2) {
        throw new BadRequestException(
          'Phone number 1 and Phone number 2 cannot be the same',
        );
      }

      // 2. Phone1 uniqueness across all records
      if (phone1) {
        const existingPhone1 = await this.securityModel.findOne({
          where: {
            orgID: user?.orgID,
            id: { [Op.ne]: id },
            [Op.or]: [{ phone1: phone1 }, { phone2: phone1 }],
          },
        });
        if (existingPhone1) {
          throw new BadRequestException(
            `Phone number ${phone1} is already assigned to another security`,
          );
        }
      }

      // 3. Phone2 uniqueness across all records
      if (phone2) {
        const existingPhone2 = await this.securityModel.findOne({
          where: {
            orgID: user?.orgID,
            id: { [Op.ne]: id },
            [Op.or]: [{ phone1: phone2 }, { phone2: phone2 }],
          },
        });
        if (existingPhone2) {
          throw new BadRequestException(
            `Phone number ${phone2} is already assigned to another security`,
          );
        }
      }

      const validationErrors = await uniqueFieldsCheck(
        this.securityModel,
        ['phone1', 'phone2', 'securityCode', 'aadharNumber'],
        updateSecurityInput,
        id,
        user?.orgID,
      );
      handleErrors(validationErrors, 'unique');
      const updatedSecurity = await this.securityModel.update(
        updateSecurityInput,
        {
          where: { id },
          returning: true,
        },
      );
      const updatedSecurityRow = updatedSecurity?.[1]?.[0];

      // Formats a date as DD/MM/YYYY, date-only.
      const formatDateOnly = (value: any): any => {
        if (!value) return value;
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      };

      // Was payload: updatedSecurity — the raw [affectedCount, rows[]]
      // tuple Sequelize returns from .update(), not a plain object.
      // DetailTable's payloadJSON branch did Object.entries() on that
      // tuple (keys "0"/"1", neither with a .label), so every row
      // rendered blank. Real per-field diff instead, scoped to fields
      // the caller actually sent, using `security` (fetched pre-update)
      // as the old-value source. dob is formatted on both sides — was
      // showing OldValue as the raw stored date and newValue as
      // whatever raw format the frontend sent (often a full ISO
      // timestamp), which never matched even when the date was
      // unchanged.
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      for (const key of Object.keys(updateSecurityInput)) {
        const oldValue = security[key];
        const newValue = updateSecurityInput[key];
        if (oldValue !== newValue) {
          changeJSON[key] = {
            OldValue: key === 'dob' ? formatDateOnly(oldValue) : oldValue,
            newValue: key === 'dob' ? formatDateOnly(newValue) : newValue,
          };
        }
      }

      const eventPayload = JSON.parse(JSON.stringify(updateSecurityInput));
      const fieldCount = Object.keys(changeJSON).length;
      const securityName = updatedSecurityRow?.name ?? security.name;
      const securityCode =
        updatedSecurityRow?.securityCode ?? security.securityCode;
      const securityIdentifier = securityCode
        ? `${securityName} - ${securityCode}`
        : securityName;

      const eventLog = {
        objectType: 'Security',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: {
          securityID: id,
          name: securityName,
          securityCode: securityCode,
        },
        requestPayload: eventPayload,
        changeJSON,
        customDescription:
          fieldCount > 1
            ? `updated ${fieldCount} fields in Security (${securityIdentifier})`
            : `updated Security (${securityIdentifier})`,
        user,
      };
      await this.eventlogService.create(eventLog);
      return {
        message: 'Security updated successfully',
        data: updatedSecurity,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async softDelete(id: bigint, user: any): Promise<GenericResponse<null>> {
    try {
      const eventLog = {
        objectType: 'Security',
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
      await this.securityModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'Security  deleted successfully',
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
