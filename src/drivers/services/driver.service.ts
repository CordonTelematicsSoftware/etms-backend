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
import { SortOrder, Status, UserType } from 'src/shared/enums';
import { UpdateDriverInput } from '../dtos/update-driver-input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Sequelize } from 'sequelize-typescript';
import { CreateDriverInput } from '../dtos/create-driver-input.dto';
import { DriverFilterInput } from '../dtos/driver-filter-input.dto';
import { Driver } from '../models/driver.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Op } from 'sequelize';
import * as XLSX from 'xlsx';
import { DriverAuthentication } from 'src/auth/models/driver-auth.model';
import { VendorUser } from 'src/vendor-management/vendor-user/models/vendor-user.model';
import { DriverDocumentUploadInput } from '../dtos/driver-document-upload.dto';
import { UploadService } from 'src/upload/services/upload.service';
import { ConfigService } from '@nestjs/config';
import { DriverDocumentUpload } from '../models/driverDocumentUpload.model';
import { DriverDocumentFilterInput } from '../dtos/driver-document-filter-input.dto';
import { DriverListFilterInput } from '../dtos/driverList-filter-input.dto';
import { OrganizationDriver } from 'src/organization-driver/models/organizationDriver.model';
import { Response } from 'express';
import * as AWS from 'aws-sdk';
import * as archiver from 'archiver';
import { EmailService } from 'src/email/email.service';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { ApprovalRequest } from 'src/approval-request/models/approval-request.model';
import { Employee } from 'src/employee/models/employee.model';
import { OrgDriverRequest } from 'src/approval-request/models/driver-org-approval-req.model';
import { DriverOrgRequestDocumentUpload } from 'src/approval-request/models/driver-org-req-document-upload.model';
import moment = require('moment');
import { computeRiskStatus } from 'src/shared/utils/status.util';
import { Authentication } from 'src/auth/models/authentication.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { randomUUID } from 'crypto';
import { DriverDeviceInfo } from 'src/auth/models/driver-device-model';

@Injectable()
export class DriverService {
  private logger = new Logger(DriverService.name);
  private s3: AWS.S3;
  constructor(
    @InjectModel(Driver)
    private driverModel: typeof Driver,
    @InjectModel(DriverAuthentication)
    private driverAuthModel: typeof DriverAuthentication,
    @InjectModel(ApprovalRequest)
    private approvalRequestModel: typeof ApprovalRequest,
    @InjectModel(VendorUser)
    private vendorUserModel: typeof VendorUser,
    @InjectModel(OrganizationDriver)
    private orgDriverModel: typeof OrganizationDriver,
    @InjectModel(DriverDocumentUpload)
    private driverDocumentUploadModel: typeof DriverDocumentUpload,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(OrgDriverRequest)
    private driverOrgRequestModel: typeof OrgDriverRequest,
    @InjectModel(DriverOrgRequestDocumentUpload)
    private driverOrgRequestDocumentUploadModel: typeof DriverOrgRequestDocumentUpload,
    @InjectModel(Authentication)
    private authenticationModel: typeof Authentication,
    private readonly sequelize: Sequelize,
    private eventlogService: EventLogService,
    private config: ConfigService,
    private uploadService: UploadService,
    private configurationService: ConfigurationService,
    private emailService: EmailService,
  ) {
    this.s3 = new AWS.S3({
      accessKeyId: this.config.get('AWSACCESSKEYID'),
      secretAccessKey: this.config.get('AWSSECRETACCESSKEY'),
      region: this.config.get('AWSREGION'),
    });
  }

  async create(
    createDriverInput: CreateDriverInput,
    files?: {
      image?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    },
    user?: any,
  ): Promise<GenericResponse<Driver>> {
    const transaction = await this.sequelize.transaction();

    try {
      const validationErrors = await uniqueFieldsCheck(
        this.driverModel,
        ['email', 'phone', 'code', 'licenseNo', 'aadharNumber'],
        createDriverInput,
        null,
        null,
        user?.vendorID,
      );
      handleErrors(validationErrors, 'unique');
      let imageUrl: string | null = null;
      if (files?.image && files.image[0]) {
        const imageFile = files.image[0];
        const fileDetails = {
          Key: `${randomUUID()}_${imageFile?.originalname}`,
          Body: imageFile?.buffer,
          Bucket: `${this.config.get('AWSBUCKETNAME')}/driver_image`,
          ContentType: imageFile?.mimetype,
        };
        imageUrl = await this.uploadService.uploadDocument(fileDetails);
      }

      const driverData = {
        ...createDriverInput,
        vendorID: user.vendorID,
        image: imageUrl,
      };
      delete driverData.documents;
      delete driverData.documentTitles;
      const driver = await this.driverModel.create(driverData, { transaction });

      if (
        files?.documents &&
        files.documents.length > 0 &&
        createDriverInput.documentTitles
      ) {
        const documentTitles = Array.isArray(createDriverInput.documentTitles)
          ? createDriverInput.documentTitles
          : [createDriverInput.documentTitles];

        for (let i = 0; i < files.documents.length; i++) {
          const file = files.documents[i];
          const title = documentTitles[i];

          if (file && title) {
            const fileDetails = {
              Key: `${randomUUID()}_${file.originalname}`,
              Body: file.buffer,
              Bucket: `${this.config.get('AWSBUCKETNAME')}/driver_documents`,
              ContentType: file.mimetype,
            };
            const fileUrl = await this.uploadService.uploadDocument(
              fileDetails,
            );

            await this.driverDocumentUploadModel.create(
              {
                driverID: driver.id,
                vendorID: user.vendorID,
                title: title,
                url: fileUrl,
                fileName: file.originalname,
                fileSize: file.size,
                fileType: file.mimetype,
              },
              { transaction },
            );
          }
        }
      }
      let driverAuth = await this.driverAuthModel.findOne({
        where: { phone: createDriverInput.phone },
        transaction,
      });

      if (!driverAuth) {
        driverAuth = await this.driverAuthModel.create(
          {
            phone: createDriverInput?.phone,
            email: createDriverInput?.email,
            userType: UserType.Driver,
            status: Status.Active,
            password: createDriverInput?.password ?? null,
            passwordCreatedAt: createDriverInput?.password ? new Date() : null,
            vendorID: user?.vendorID,
            driverID: driver.id,
            name: createDriverInput?.name,
          },
          { transaction },
        );
      }
      if (driverAuth?.id) {
        await driver.update({ driverAuthID: driverAuth.id }, { transaction });
      }
      await transaction.commit();
      const eventPayload = JSON.parse(JSON.stringify(createDriverInput));
      const eventLog = {
        objectType: 'Driver',
        changeType: 'add',
        objectID: driver.id,
        authID: null,
        orgID: '',
        updatedBy: '',
        payload: driver,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Driver created successfully',
        data: driver,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async importDrivers(file: Buffer, user: any): Promise<object> {
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
      const sheetDataObjects: any = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        { raw: false },
      );
      if (!sheetDataObjects?.length) {
        throw new BadRequestException(
          'The Excel file contains no valid data rows.',
        );
      }
      const { validatedData, errors } = await this.validateDriverSheetData(
        sheetDataObjects,
        user,
      );

      if (errors.length > 0) {
        const errorMessages = errors.map((e) => `Row ${e.row}: ${e.message}`);
        throw new Error(`Validation failed: ${errorMessages.join(',  ')}`);
      }
      const transaction = await this.sequelize.transaction();
      try {
        const vendorUser = await this.vendorUserModel.findOne({
          where: { vendorID: user.vendorID },
        });
        const vendorUserID = vendorUser ? vendorUser.id : null;
        const createDrivers = await this.driverModel.bulkCreate(
          validatedData.map(({ row }) => {
            const {
              Name: name,
              Code: code,
              Phone: phone,
              DOB: dob,
              Email: email,
              Address: address,
              'Aadhar Number': aadharNumber,
              'License Expiry': licenseExpiry,
              'License No': licenseNo,
              'Med Fit Expiry': medFitExpiry,
              'Police Clearence Expiry': policeClearenceExpiry,
            } = row;

            return {
              vendorID: user.vendorID,
              name,
              code,
              phone,
              dob: this.formatExcelDate(dob),
              email,
              address,
              aadharNumber,
              licenseExpiry: this.formatExcelDate(licenseExpiry),
              licenseNo,
              medFitExpiry: this.formatExcelDate(medFitExpiry),
              policeClearenceExpiry: this.formatExcelDate(
                policeClearenceExpiry,
              ),
              status: Status.Active,
            };
          }),
          { transaction },
        );
        const driverAuthData = createDrivers.map((driver) => {
          return {
            name: driver.name,
            code: driver.code,
            email: driver.email,
            phone: driver.phone,
            vendorID: user.vendorID,
            driverID: driver.id,
            vendorUserID,
            status: Status.Active,
            userType: UserType.Driver,
          };
        });
        const phoneNumbers = driverAuthData.map((data) => data.phone);
        const existingDriverAuths = await this.driverAuthModel.findAll({
          where: {
            phone: phoneNumbers,
          },
          transaction,
        });
        // Filter out records that already exist
        const existingPhones = existingDriverAuths.map((auth) => auth.phone);
        const newDriverAuthData = driverAuthData.filter(
          (data) => !existingPhones.includes(data.phone),
        );
        if (newDriverAuthData.length > 0) {
          await this.driverAuthModel.bulkCreate(newDriverAuthData, {
            transaction,
          });
        }
        await transaction.commit();
        return {
          message: `${validatedData?.length} drivers created successfully.`,
        };
      } catch (error) {
        await transaction.rollback();
        throw new BadRequestException(`Import failed: ${error.message}`);
      }
    } catch (error) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  async downloadDriverDocuments(id: any, user: any, res: Response) {
    const docs = await this.driverDocumentUploadModel.findAll({
      where: { driverID: id, vendorID: user.vendorID },
    });

    if (!docs.length) {
      throw new NotFoundException(`No documents found for this driver`);
    }

    // 3. Set headers immediately (before any async operations)
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=driver_${id}_documents.zip`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });

    // 4. Handle archive errors without throwing
    archive.on('error', (err) => {
      this.logger.log('import service---', err);

      res.end(); // Just end the stream, don't throw
    });

    // 5. Pipe to response
    archive.pipe(res);

    // 6. Add files with proper error handling
    for (const doc of docs) {
      try {
        const key = decodeURIComponent(doc.url.split('.amazonaws.com/')[1]);

        const stream = this.s3
          .getObject({
            Bucket: process.env.AWSBUCKETNAME,
            Key: key,
          })
          .createReadStream();

        // Handle stream errors gracefully
        stream.on('error', (error) => {
          this.logger.log('import service---', error);
          // console.error(`Error reading file ${doc.url}:`, error);
          // Don't throw - let archiver continue with other files
        });

        archive.append(stream, {
          name: key.split('/').pop(),
        });
      } catch (error) {}
    }

    // 7. Finalize - wrap in try-catch to prevent any throws after headers
    try {
      await archive.finalize();
    } catch (error) {
      // console.error('Error finalizing archive:', error);
      res.end();
    }
  }

  private formatExcelDate(inputDate: any): string | null {
    if (!inputDate) return null;

    if (typeof inputDate === 'string') {
      inputDate = inputDate.trim();
    }
    let parsedDate;

    if (!isNaN(inputDate) && typeof inputDate === 'number') {
      parsedDate = moment(
        new Date(Math.round((inputDate - 25569) * 86400 * 1000)),
      );
    } else {
      parsedDate = moment(
        inputDate,
        [
          moment.ISO_8601,
          'YYYY-MM-DD',
          'DD-MM-YYYY',
          'MM-DD-YYYY',
          'DD/MM/YYYY',
          'MM/DD/YYYY',
          'M/DD/YY',
          'M/D/YY',
          'MM/DD/YY',
          'YYYY/MM/DD',
          'YYYY/DD/MM',
        ],
        true,
      );
    }

    if (!parsedDate.isValid()) {
      throw new BadRequestException('Invalid date format');
    }

    return parsedDate.format('YYYY-MM-DD');
  }

  private async validateDriverSheetData(
    sheetData: any[],
    user: any,
  ): Promise<{
    validatedData: any[];
    errors: { row: number; message: string }[];
  }> {
    const errors: { row: number; message: string }[] = [];
    const validatedData: any[] = [];
    const enteredCodes = new Set<string>();
    const enteredPhones = new Set<string>();
    const enteredLicenseNos = new Set<string>();
    const enteredEmails = new Set<string>();
    const enteredAadharNumbers = new Set<string>();

    for (let index = 0; index < sheetData.length; index++) {
      const row = sheetData[index];
      const rowErrors: string[] = [];
      const rowNumber = index + 2;

      try {
        const name = (row['Name'] || '').trim();
        const code = (row['Code'] || '').trim();
        const phone = (row['Phone'] || '').toString().trim();
        const dob = (row['DOB'] || '').trim();
        const email = (row['Email'] || '').trim();
        const address = (row['Address'] || '').trim();
        const aadharNumber = (row['Aadhar Number'] || '').toString().trim();
        const licenseExpiry = (row['License Expiry'] || '').trim();
        const licenseNo = (row['License No'] || '').trim();
        const medFitExpiry = (row['Med Fit Expiry'] || '').trim();
        const policeClearenceExpiry = (
          row['Police Clearence Expiry'] || ''
        ).trim();

        if (!name) rowErrors.push('Name is required');
        if (!phone) rowErrors.push('Phone is required');
        if (!dob) rowErrors.push('DOB is required');
        // if (!email) rowErrors.push('Email is required');
        if (!address) rowErrors.push('Address is required');
        // if (!aadharNumber) rowErrors.push('Aadhar Number is required');
        if (!licenseExpiry) rowErrors.push('License Expiry is required');
        if (!licenseNo) rowErrors.push('License No is required');
        if (!medFitExpiry) rowErrors.push('Med Fit Expiry is required');
        if (!policeClearenceExpiry)
          rowErrors.push('Police Clearence Expiry is required');

        if (rowErrors.length > 0) {
          errors.push({ row: rowNumber, message: rowErrors.join(', ') });
          continue;
        }

        //  Check duplicates inside Excel file
        if (code && enteredCodes.has(code))
          rowErrors.push('Duplicate code in file');
        if (phone && enteredPhones.has(phone))
          rowErrors.push('Duplicate phone number in file');
        if (licenseNo && enteredLicenseNos.has(licenseNo))
          rowErrors.push('Duplicate license no in file');
        if (email && enteredEmails.has(email))
          rowErrors.push('Duplicate Email in file');
        if (aadharNumber && enteredAadharNumbers.has(aadharNumber))
          rowErrors.push('Duplicate aadhar number in file');

        // Add to sets for future comparisons
        if (code) enteredCodes.add(code);
        if (phone) enteredPhones.add(phone);
        if (licenseNo) enteredLicenseNos.add(licenseNo);
        if (email) enteredEmails.add(email);
        if (aadharNumber) enteredAadharNumbers.add(aadharNumber);

        const whereConditions: any = {
          vendorID: user?.vendorID,
          [Op.or]: [{ phone }, { licenseNo }, { code }],
        };
        if (email) whereConditions[Op.or].push({ email });
        if (aadharNumber) whereConditions[Op.or].push({ aadharNumber });

        const existingRecords = await this.driverModel.findAll({
          where: whereConditions,
        });

        if (existingRecords.length > 0) {
          const existingFields: string[] = [];
          if (existingRecords.some((r) => r.phone === phone))
            existingFields.push('phone');
          if (
            aadharNumber &&
            existingRecords.some((r) => r.aadharNumber === aadharNumber)
          )
            existingFields.push('aadhar number');
          if (existingRecords.some((r) => r.code === code))
            existingFields.push('code');
          if (email && existingRecords.some((r) => r.email === email))
            existingFields.push('email');
          if (existingRecords.some((r) => r.licenseNo === licenseNo))
            existingFields.push('license number');

          rowErrors.push(
            `Duplicate record found (${existingFields.join(', ')})`,
          );
        }

        if (!/^[A-Z]{2}\d{2}\d{6,11}$/.test(licenseNo)) {
          rowErrors.push(
            'Invalid license number format (should be like DL123456789012)',
          );
        }

        if (!/^[0-9]{10}$/.test(phone)) {
          rowErrors.push('Invalid phone number format (should be 10 digits)');
        }

        try {
          const today = moment().startOf('day');
          const dobDate = moment(await this.formatExcelDate(dob));
          if (dobDate.isAfter(today.subtract(18, 'years'))) {
            rowErrors.push('Driver must be at least 18 years old');
          }
        } catch (e) {
          rowErrors.push('Invalid DOB format');
        }

        const validateFutureDate = async (dateValue, fieldName) => {
          try {
            const formattedDate = moment(await this.formatExcelDate(dateValue));
            const today = moment().startOf('day');
            if (formattedDate.isSameOrBefore(today, 'day')) {
              rowErrors.push(`${fieldName} should be in the future`);
            }
          } catch (e) {
            rowErrors.push(`Invalid ${fieldName} format`);
          }
        };

        validateFutureDate(licenseExpiry, 'License Expiry');
        validateFutureDate(medFitExpiry, 'Med Fit Expiry');
        validateFutureDate(policeClearenceExpiry, 'Police Clearence Expiry');

        if (rowErrors.length > 0) {
          errors.push({ row: rowNumber, message: rowErrors.join('; ') });
        } else {
          // validatedData.push({ row });
          validatedData.push({
            row: {
              Name: name.trim(),
              Code: code.trim(),
              Phone: phone.trim(),
              DOB: dob.trim(),
              Email: email.trim(),
              Address: address.trim(),
              'Aadhar Number': aadharNumber.trim(),
              'License Expiry': licenseExpiry.trim(),
              'License No': licenseNo.trim(),
              'Med Fit Expiry': medFitExpiry.trim(),
              'Police Clearence Expiry': policeClearenceExpiry.trim(),
            },
          });
        }
      } catch (error: any) {
        errors.push({ row: rowNumber, message: error.message });
      }
    }

    return { validatedData, errors };
  }

  async findAll(
    driverFilterInput: DriverFilterInput,
    user: any,
  ): Promise<PaginatedList<Driver>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        expiryType,
        status,
        search,
      } = driverFilterInput;

      const currentDate = new Date();
      const oneWeekFromNow = new Date(currentDate);
      oneWeekFromNow.setDate(currentDate.getDate() + 7);

      const oneMonthFromNow = new Date(currentDate);
      oneMonthFromNow.setMonth(currentDate.getMonth() + 1);
      let whereClause: any = {};

      const vendorID = user.vendorID;
      if (vendorID) {
        whereClause['vendorID'] = vendorID;
      }
      if (status) {
        whereClause['status'] = status;
      }
      if (expiryType) {
        const expiryConditions = [];
        if (expiryType === 'expired') {
          expiryConditions.push({ licenseExpiry: { [Op.lt]: currentDate } });
          expiryConditions.push({
            policeClearenceExpiry: { [Op.lt]: currentDate },
          });
          expiryConditions.push({ medFitExpiry: { [Op.lt]: currentDate } });
        } else if (expiryType === 'withinOneWeek') {
          expiryConditions.push({
            licenseExpiry: { [Op.gte]: currentDate, [Op.lt]: oneWeekFromNow },
          });
          expiryConditions.push({
            policeClearenceExpiry: {
              [Op.gte]: currentDate,
              [Op.lt]: oneWeekFromNow,
            },
          });
          expiryConditions.push({
            medFitExpiry: { [Op.gte]: currentDate, [Op.lt]: oneWeekFromNow },
          });
        } else if (expiryType === 'withinOneMonth') {
          expiryConditions.push({
            licenseExpiry: { [Op.gte]: currentDate, [Op.lt]: oneMonthFromNow },
          });
          expiryConditions.push({
            policeClearenceExpiry: {
              [Op.gte]: currentDate,
              [Op.lt]: oneMonthFromNow,
            },
          });
          expiryConditions.push({
            medFitExpiry: { [Op.gte]: currentDate, [Op.lt]: oneMonthFromNow },
          });
        }

        if (expiryConditions.length > 0) {
          whereClause[Op.or] = expiryConditions;
        }
      }
      if (search) {
        whereClause = {
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              email: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              code: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              phone: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              licenseNo: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
        whereClause.vendorID = user.vendorID;
      }
      const driver = await this.driverModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        subQuery: false,
        include: [
          {
            model: Vendor,
            as: 'role', // alias is 'role' on the Driver model despite being the vendor relation
            attributes: ['id', [Sequelize.literal('"role"."name"'), 'Vendor']],
          },
          {
            model: DriverDeviceInfo,
            as: 'driverDeviceInfo',
            attributes: ['appVersion', 'deviceType', 'lastLogin'],
            required: false, // keep drivers who have no device record
            where: {
              // appVersion: { [Op.ne]: null },
              // deviceType: { [Op.ne]: null },
              lastLogin: {
                [Op.eq]: Sequelize.literal(`(
                SELECT MAX("ddi2"."lastLogin")
                FROM "DriverDeviceInfos" AS "ddi2"
                WHERE "ddi2"."driverID" = "Driver"."id"
                  AND "ddi2"."deletedAt" IS NULL
              )`),
              },
            },
          },
        ],
      });

      return {
        totalItems: driver.count,
        items: driver.rows,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllUnassignedDrivers(
    driverFilterInput: DriverFilterInput,
    user: any,
  ): Promise<PaginatedList<Driver>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        expiryType,
        status,
        search,
      } = driverFilterInput;

      const currentDate = new Date();
      const oneWeekFromNow = new Date(currentDate);
      oneWeekFromNow.setDate(currentDate.getDate() + 7);

      const oneMonthFromNow = new Date(currentDate);
      oneMonthFromNow.setMonth(currentDate.getMonth() + 1);
      let whereClause: any = {};

      const vendorID = user.vendorID;
      if (vendorID) {
        whereClause['vendorID'] = vendorID;
      }
      if (status) {
        whereClause['status'] = status;
      }
      if (expiryType) {
        const expiryConditions = [];
        if (expiryType === 'expired') {
          expiryConditions.push({ licenseExpiry: { [Op.lt]: currentDate } });
          expiryConditions.push({
            policeClearenceExpiry: { [Op.lt]: currentDate },
          });
          expiryConditions.push({ medFitExpiry: { [Op.lt]: currentDate } });
        } else if (expiryType === 'withinOneWeek') {
          expiryConditions.push({
            licenseExpiry: { [Op.gte]: currentDate, [Op.lt]: oneWeekFromNow },
          });
          expiryConditions.push({
            policeClearenceExpiry: {
              [Op.gte]: currentDate,
              [Op.lt]: oneWeekFromNow,
            },
          });
          expiryConditions.push({
            medFitExpiry: { [Op.gte]: currentDate, [Op.lt]: oneWeekFromNow },
          });
        } else if (expiryType === 'withinOneMonth') {
          expiryConditions.push({
            licenseExpiry: { [Op.gte]: currentDate, [Op.lt]: oneMonthFromNow },
          });
          expiryConditions.push({
            policeClearenceExpiry: {
              [Op.gte]: currentDate,
              [Op.lt]: oneMonthFromNow,
            },
          });
          expiryConditions.push({
            medFitExpiry: { [Op.gte]: currentDate, [Op.lt]: oneMonthFromNow },
          });
        }

        if (expiryConditions.length > 0) {
          whereClause[Op.or] = expiryConditions;
        }
      }
      if (search) {
        whereClause = {
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              email: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              code: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              phone: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              licenseNo: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
        whereClause.vendorID = user.vendorID;
      }
      // for dedupliucated list of drivers from cab
      whereClause.id = {
        [Op.notIn]: [
          Sequelize.literal(`(
          SELECT DISTINCT "driverID" FROM "Cabs" WHERE "driverID" IS NOT NULL
          UNION
          SELECT DISTINCT "driver2ID" FROM "Cabs" WHERE "driver2ID" IS NOT NULL
        )`),
        ],
      };

      const driver = await this.driverModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        subQuery: false,
      });

      return {
        totalItems: driver.count,
        items: driver.rows,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async listAllDrivers(
    driverListFilterInput: DriverListFilterInput,
    user: any,
  ): Promise<PaginatedList<Driver>> {
    try {
      const {
        // take = 25,
        // skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        expiryType,
        status,
        // search,
      } = driverListFilterInput;

      const currentDate = new Date();
      const oneWeekFromNow = new Date(currentDate);
      oneWeekFromNow.setDate(currentDate.getDate() + 7);

      const oneMonthFromNow = new Date(currentDate);
      oneMonthFromNow.setMonth(currentDate.getMonth() + 1);
      const whereClause: any = {};

      const vendorID = user.vendorID;
      if (vendorID) {
        whereClause['vendorID'] = vendorID;
      }
      if (status) {
        whereClause['status'] = status;
      }
      if (expiryType) {
        const expiryConditions = [];
        if (expiryType === 'expired') {
          expiryConditions.push({ licenseExpiry: { [Op.lt]: currentDate } });
          expiryConditions.push({
            policeClearenceExpiry: { [Op.lt]: currentDate },
          });
          expiryConditions.push({ medFitExpiry: { [Op.lt]: currentDate } });
        } else if (expiryType === 'withinOneWeek') {
          expiryConditions.push({
            licenseExpiry: { [Op.gte]: currentDate, [Op.lt]: oneWeekFromNow },
          });
          expiryConditions.push({
            policeClearenceExpiry: {
              [Op.gte]: currentDate,
              [Op.lt]: oneWeekFromNow,
            },
          });
          expiryConditions.push({
            medFitExpiry: { [Op.gte]: currentDate, [Op.lt]: oneWeekFromNow },
          });
        } else if (expiryType === 'withinOneMonth') {
          expiryConditions.push({
            licenseExpiry: { [Op.gte]: currentDate, [Op.lt]: oneMonthFromNow },
          });
          expiryConditions.push({
            policeClearenceExpiry: {
              [Op.gte]: currentDate,
              [Op.lt]: oneMonthFromNow,
            },
          });
          expiryConditions.push({
            medFitExpiry: { [Op.gte]: currentDate, [Op.lt]: oneMonthFromNow },
          });
        }

        if (expiryConditions.length > 0) {
          whereClause[Op.or] = expiryConditions;
        }
      }
      const driver = await this.driverModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: [[`${sortBy}`, `${sortOrder}`]],
        // limit: take,
        // offset: skip * take,
        subQuery: false,
        include: [
          {
            model: Vendor,
            as: 'role', // alias is 'role' on the Driver model despite being the vendor relation
            attributes: ['id', [Sequelize.literal('"role"."name"'), 'Vendor']],
          },
          {
            model: DriverDeviceInfo,
            as: 'driverDeviceInfo',
            attributes: ['appVersion', 'deviceType', 'lastLogin'],
            required: false, // keep drivers who have no device record
            where: {
              // appVersion: { [Op.ne]: null },
              // deviceType: { [Op.ne]: null },
              lastLogin: {
                [Op.eq]: Sequelize.literal(`(
                SELECT MAX("ddi2"."lastLogin")
                FROM "DriverDeviceInfos" AS "ddi2"
                WHERE "ddi2"."driverID" = "Driver"."id"
                  AND "ddi2"."deletedAt" IS NULL
              )`),
              },
            },
          },
        ],
      });

      const items = driver.rows.map((row) => {
        const plain: any = row.toJSON();
        plain.riskStatus = computeRiskStatus([
          plain.licenseExpiry,
          plain.medFitExpiry,
          plain.policeClearenceExpiry,
        ]);
        return plain;
      });

      return {
        totalItems: driver.count,
        items,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getDriverDocuments(
    driverDocumentFilterInput: DriverDocumentFilterInput,
    user: any,
  ): Promise<PaginatedList<DriverDocumentUpload>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        driverID,
      } = driverDocumentFilterInput;
      const whereClause: any = {};
      if (driverID) {
        whereClause.driverID = driverID;
      }
      whereClause.vendorID = user.vendorID;
      const driver = await this.driverDocumentUploadModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        where: whereClause,
        offset: skip * take,
        subQuery: false,
      });
      return {
        totalItems: driver.count,
        items: driver.rows,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findUnassignedUnexpiredDrivers(
    driverFilterInput: DriverFilterInput,
    user: any,
  ): Promise<PaginatedList<Driver>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        status,
        // search,
        // expiryType,
        orgID,
      } = driverFilterInput;

      const currentDate = new Date().toISOString().split('T')[0];
      const whereClause: any = {};

      const vendorID = user.vendorID;
      if (status) {
        whereClause.status = status;
      }
      if (vendorID) {
        whereClause.vendorID = vendorID;
      }

      const newOrgID = orgID || user?.orgID || user?.employee?.orgID;

      // expiry filter
      const expiryConditions = {
        medFitExpiry: { [Op.gte]: currentDate },
        policeClearenceExpiry: { [Op.gte]: currentDate },
        licenseExpiry: { [Op.gte]: currentDate },
      };

      const assignedOrgDrivers = await this.orgDriverModel.findAll({
        where: {
          orgID: newOrgID,
          // vendorID,
          status: { [Op.ne]: 'Rejected' },
        },
        attributes: ['driverID'],
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'licenseNo'],
          },
        ],
        raw: true,
      });
      const assignedDriverIds = assignedOrgDrivers.map((o: any) => o.driverID);
      const assignedLicenseNos = assignedOrgDrivers.map(
        (o: any) => o['driver.licenseNo'],
      );

      const { rows: drivers, count } = await this.driverModel.findAndCountAll({
        distinct: true,
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        where: {
          ...whereClause,
          ...expiryConditions,
          ...(assignedDriverIds.length > 0
            ? { id: { [Op.notIn]: assignedDriverIds } }
            : {}), // only apply if there are assigned IDs
          ...(assignedLicenseNos.length > 0
            ? { licenseNo: { [Op.notIn]: assignedLicenseNos } }
            : {}),
        },
      });

      return {
        items: drivers,
        totalItems: count,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Two axes, both legitimate, answering different questions:
   *   Drivers.vendorID    - the vendor that ONBOARDED this driver. Their record
   *                         to administer, before and independent of any org
   *                         approval. 1381 live drivers are owned this way with
   *                         no Approved link at all.
   *   OrganizationDrivers - a vendor invited this driver into an org and that
   *     (status Approved)   org's admin approved it. Only then does the driver
   *                         appear in that org's panel.
   * A driver may be onboarded by several vendors independently, so a vendor
   * passes on either axis; an org admin has no ownership axis and needs the link.
   */
  private async assertDriverVisible(id: string, user: any): Promise<void> {
    if (user?.userType === UserType.SuperAdmin) return;

    if (user?.vendorID) {
      const owned = await this.driverModel.findOne({
        where: { id, vendorID: user.vendorID },
        attributes: ['id'],
      });
      if (owned) return;
    }

    // Driver.vendorID is deliberately NOT re-asserted here: 749 rows disagree
    // with the join table and the join table is authoritative for deployment
    // (trip.service.ts:5483-5487).
    if (!user?.vendorID && !user?.orgID) {
      throw new NotFoundException('Invalid Driver id');
    }
    const scope: any = { driverID: id, status: Status.Approved };
    if (user?.vendorID) scope.vendorID = user.vendorID;
    if (user?.orgID) scope.orgID = user.orgID;

    if (!(await this.orgDriverModel.findOne({ where: scope }))) {
      throw new NotFoundException('Invalid Driver id');
    }
  }

  async findOne(id: string, user: any): Promise<GenericResponse<Driver>> {
    try {
      await this.assertDriverVisible(id, user);
      const driver = await this.driverModel.findOne({
        where: { id },
      });
      if (driver)
        return {
          message: 'Driver found',
          data: driver,
        };
      else throw new NotFoundException('Invalid Driver id');
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateDriverInput: UpdateDriverInput,
    user: any,
    files?: {
      image?: Express.Multer.File;
      documents?: Express.Multer.File[];
    },
  ): Promise<any> {
    try {
      const driverById = await this.findOne(id, user);
      const updateData = {
        ...updateDriverInput,
      };
      // image is only ever written from an uploaded file below. The vendor portal
      // echoes the GET's image URL back as a plain body field, and reads are now
      // presigned, so without this an expiring URL would be persisted.
      delete updateData.image;
      delete updateData.documents;
      delete updateData.documentTitles;
      delete updateData.existingDocuments;

      const validationErrors = await uniqueFieldsCheck(
        this.driverModel,
        ['email', 'phone', 'code', 'licenseNo', 'aadharNumber'],
        updateDriverInput,
        id,
        null,
        user.vendorID,
      );
      handleErrors(validationErrors, 'unique');

      // Handle image upload if provided
      let imageUrl: string | null = null;
      if (files?.image && files.image[0]) {
        // Access first element
        const imageFile = files.image[0];
        const fileDetails = {
          Key: `${imageFile.originalname}`,
          Body: imageFile.buffer,
          Bucket: `${this.config.get('AWSBUCKETNAME')}/driver_image`,
          ContentType: imageFile.mimetype,
        };
        imageUrl = await this.uploadService.uploadDocument(fileDetails);
        updateData.image = imageUrl;
      }

      const existingDriver = await this.driverModel.findOne({
        where: { id },
      });
      if (!existingDriver) {
        throw new NotFoundException('Driver not found');
      }
      //old and new record for approval request table and listing
      const oldRecord: Record<string, any> = {};
      const newRecord: Record<string, any> = {};
      const currentData = existingDriver.get({ plain: true });
      //fields that require approval
      const approvalFields = [
        'licenseExpiry',
        'badgeExpiry',
        'bgVerificationExpiry',
        'policeClearenceExpiry',
        'medFitExpiry',
      ];
      const approvalDocumentTitles = [
        'Driver License',
        'Display Badge',
        'BGV Document',
        'Driver PVC Document',
        'Medical Fitness Document',
      ];

      const ignoreFields = ['documents', 'documentTitles', 'existingDocuments'];
      const dateFields = [
        'licenseExpiry',
        'badgeExpiry',
        'bgVerificationExpiry',
        'policeClearenceExpiry',
        'medFitExpiry',
        'dob',
      ];

      const normalizeValue = (key: string, value: any) => {
        if (value === null || value === undefined) return value;

        if (dateFields.includes(key)) {
          return moment(value).format('YYYY-MM-DD');
        }

        return value;
      };
      // Compare only approval fields
      Object.keys(updateData).forEach((key) => {
        if (!approvalFields.includes(key)) return;
        if (ignoreFields.includes(key)) return;

        const oldValue = normalizeValue(key, currentData[key]);
        const newValue = normalizeValue(key, updateData[key]);

        if (oldValue !== newValue) {
          oldRecord[key] = oldValue;
          newRecord[key] = newValue;
        }
      });

      // await this.sessionService.invalidate(id, 'Driver'); // force logout for drivers who are currently logged in
      // Process documents only if files are provided
      const uploadedDocuments: any[] = [];

      if (
        files?.documents &&
        files.documents.length > 0 &&
        updateDriverInput.documentTitles
      ) {
        const documentTitles = Array.isArray(updateDriverInput.documentTitles)
          ? updateDriverInput.documentTitles
          : [updateDriverInput.documentTitles];

        const existingDocuments = await this.driverDocumentUploadModel.findAll({
          where: { driverID: id },
          attributes: ['title', 'url'],
        });

        const existingDocMap = existingDocuments.reduce((acc, doc: any) => {
          acc[doc.title] = doc.url;
          return acc;
        }, {});

        oldRecord.documents ??= [];
        newRecord.documents ??= [];

        for (let i = 0; i < files.documents.length; i++) {
          const file = files.documents[i];
          const title = documentTitles[i];

          if (!file || !title) continue;

          const fileDetails = {
            Key: file.originalname,
            Body: file.buffer,
            Bucket: `${this.config.get('AWSBUCKETNAME')}/driver_documents`,
            ContentType: file.mimetype,
          };

          const fileUrl = await this.uploadService.uploadDocument(fileDetails);

          uploadedDocuments.push({
            title,
            url: fileUrl,
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
          });

          if (approvalDocumentTitles.includes(title)) {
            if (existingDocMap[title]) {
              oldRecord.documents.push({
                title,
                url: existingDocMap[title],
              });
            }

            newRecord.documents.push({
              title,
              url: fileUrl,
            });
          }
        }
      }
      const hasApprovalChanges =
        Object.keys(newRecord).some((key) => key !== 'documents') ||
        (newRecord.documents?.length ?? 0) > 0;
      if (hasApprovalChanges) {
        const orgDriverMappings = await this.orgDriverModel.findAll({
          where: {
            driverID: id,
            status: 'Approved',
          },
          attributes: ['orgID'],
        });

        const authRecord = await this.authenticationModel.findOne({
          where: { id: user.id },
          attributes: ['email'],
        });
        const approvalRequests = [];
        for (const mapping of orgDriverMappings) {
          const approvalEnabled =
            (await this.configurationService.getConfigValue(
              'Approval Request',
              BigInt(mapping.orgID),
            )) === 'Yes';

          if (!approvalEnabled) continue;
          const lastRequest = await this.approvalRequestModel.findOne({
            where: {
              driverID: id,
              orgID: mapping.orgID,
            },
            order: [['updatedAt', 'DESC']],
          });

          const lastOldRecord = lastRequest?.oldRecord as any;
          const finalOldRecord = { ...(oldRecord as any) };
          if (
            lastRequest &&
            lastRequest.status === 'Rejected' &&
            lastRequest.oldRecord
          ) {
            Object.keys(newRecord).forEach((key) => {
              if (key === 'documents') return;
              if (
                Object.prototype.hasOwnProperty.call(lastRequest.oldRecord, key)
              ) {
                finalOldRecord[key] = lastRequest.oldRecord[key];
              }
            });

            if (Array.isArray(lastOldRecord.documents)) {
              finalOldRecord.documents = [...(lastOldRecord.documents ?? [])];
            }
          }
          approvalRequests.push({
            requestedBy: 'Vendor',
            vendorID: user.vendorID,
            driverID: id,
            orgID: mapping.orgID,
            requestType: 'Driver Update',
            referenceID: id,
            oldRecord: finalOldRecord,
            newRecord,
            status: 'Pending',
          });
          const employee = await this.employeeModel.findOne({
            where: {
              orgID: BigInt(mapping.orgID),
              employeeType: UserType.Admin,
            },
            attributes: ['email', 'name'],
          });
          if (employee?.email) {
            const emailOldRecord = { ...finalOldRecord };
            const emailNewRecord = { ...newRecord };

            approvalFields.forEach((key) => {
              if (emailOldRecord[key]) {
                emailOldRecord[key] = moment(emailOldRecord[key]).format(
                  'DD-MM-YYYY',
                );
              }

              if (emailNewRecord[key]) {
                emailNewRecord[key] = moment(emailNewRecord[key]).format(
                  'DD-MM-YYYY',
                );
              }
            });
            const alertEmailsRaw =
              await this.configurationService.getConfigValue(
                'Cab Driver Edit Email Recipients',
                BigInt(mapping.orgID),
              );
            const extraEmails = alertEmailsRaw
              ? alertEmailsRaw
                  .split(',')
                  .map((e) => e.trim())
                  .filter(Boolean)
              : [];
            const mailTo = [...new Set([employee?.email, ...extraEmails])];

            await this.emailService.sendEmail({
              mailTo, //  organization admin and the recipients sepcified in config
              subject: 'Driver Update Approval Request',
              templateName: 'driver-approval-request',
              mailBody: {
                driverName: updateData?.name,
                vendorName: user.name,
                requestedByEmail: authRecord.email,
                oldRecord: emailOldRecord,
                newRecord: emailNewRecord,
                deepLink: `${this.config.get(
                  'ADMIN_VERIFY_URL',
                )}/approval-request?tab=pending`,
              },
              isAttachments: false,
              attachments: [],
            });
          }
          const driverOrgRequest = await this.driverOrgRequestModel.findOne({
            where: {
              driverID: id,
              orgID: mapping.orgID,
            },
          });

          if (!driverOrgRequest) {
            const driverSnapshot = existingDriver.get({ plain: true });

            delete driverSnapshot.id;
            delete driverSnapshot.createdAt;
            delete driverSnapshot.updatedAt;
            delete driverSnapshot.deletedAt;

            const createdDriverOrgRequest =
              await this.driverOrgRequestModel.create({
                driverID: id,
                orgID: mapping.orgID,
                ...driverSnapshot,
              });
            const driverDocuments =
              await this.driverDocumentUploadModel.findAll({
                where: { driverID: id },
              });

            for (const doc of driverDocuments) {
              const existingDoc =
                await this.driverOrgRequestDocumentUploadModel.findOne({
                  where: {
                    driverOrgRequestID: createdDriverOrgRequest.id,
                    title: doc.title,
                  },
                });

              if (!existingDoc) {
                await this.driverOrgRequestDocumentUploadModel.create({
                  driverOrgRequestID: createdDriverOrgRequest.id,
                  driverID: id,
                  orgID: mapping.orgID,
                  vendorID: user.vendorID,
                  title: doc.title,
                  url: doc.url,
                });
              }
            }
          }
        }
        if (approvalRequests.length > 0) {
          await this.approvalRequestModel.bulkCreate(approvalRequests);
        }
      }
      // Update driver data
      const driver = await this.driverModel.update(updateData, {
        where: { id },
        returning: true,
      });
      await this.driverAuthModel.update(
        {
          name: updateDriverInput.name,
          phone: updateDriverInput.phone,
          email: updateDriverInput.email,
        },
        {
          where: { driverID: id },
        },
      );
      if (uploadedDocuments.length > 0) {
        const titles = uploadedDocuments.map((doc) => doc.title);

        await this.driverDocumentUploadModel.destroy({
          where: {
            driverID: id,
            title: {
              [Op.in]: titles,
            },
          },
        });

        await this.driverDocumentUploadModel.bulkCreate(
          uploadedDocuments.map((doc) => ({
            driverID: id,
            vendorID: user.vendorID,
            title: doc.title,
            url: doc.url,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            fileType: doc.fileType,
          })),
        );
      }
      const orgdriverUpdateData = { ...updateData };
      approvalFields.forEach((field) => {
        delete orgdriverUpdateData[field];
      });
      const orgDriverRequests = await this.driverOrgRequestModel.findAll({
        where: {
          driverID: id,
        },
      });
      for (const orgdriverRequest of orgDriverRequests) {
        await orgdriverRequest.update(orgdriverUpdateData);
      }
      const nonApprovalDocs = uploadedDocuments.filter(
        (doc) => !approvalDocumentTitles.includes(doc.title),
      );
      for (const orgdriverRequest of orgDriverRequests) {
        for (const doc of nonApprovalDocs) {
          await this.driverOrgRequestDocumentUploadModel.destroy({
            where: {
              driverOrgRequestID: orgdriverRequest.id,
              title: doc.title,
            },
          });

          await this.driverOrgRequestDocumentUploadModel.create({
            driverOrgRequestID: orgdriverRequest.id,
            driverID: id,
            orgID: orgdriverRequest.orgID,
            vendorID: user.vendorID,
            title: doc.title,
            url: doc.url,
          });
        }
      }
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
      // dob isn't in approvalFields/dateFields (those are scoped to the
      // 5 approval-gated expiry fields), but it's still a date column
      // that needs the same display formatting for the log.
      const eventDateFields = dateFields;

      // Full field-level diff, built explicitly — was previously relying
      // on EventLogService's generic auto-diff (payload: driverById.data
      // vs requestPayload), which compared the raw DB dataValues
      // (YYYY-MM-DD) against whatever raw format the frontend sent
      // (often a full ISO timestamp), so New Value showed an
      // unformatted ISO string instead of a clean date.
      const eventChangeJSON: Record<string, { OldValue: any; newValue: any }> =
        {};
      for (const key of Object.keys(updateData)) {
        if (ignoreFields.includes(key)) continue;
        const oldValue = normalizeValue(key, currentData[key]);
        const newValue = normalizeValue(key, updateData[key]);
        if (oldValue !== newValue) {
          eventChangeJSON[key] = {
            OldValue: eventDateFields.includes(key)
              ? formatDateOnly(currentData[key])
              : currentData[key],
            newValue: eventDateFields.includes(key)
              ? formatDateOnly(updateData[key])
              : updateData[key],
          };
        }
      }
      // Just names which document(s) were updated — nothing fancier.
      if (uploadedDocuments.length > 0) {
        eventChangeJSON['Documents'] = {
          OldValue: 'N/A',
          newValue: uploadedDocuments.map((doc) => doc.title).join(', '),
        };
      }

      const eventPayload = JSON.parse(JSON.stringify(updateDriverInput));
      // Only appended when true — an approval-not-required edit says
      // nothing extra about approval at all.
      const approvalNote = hasApprovalChanges ? ' - sent for approval' : '';
      const eventLog = {
        objectType: 'Driver',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: driverById.data,
        requestPayload: eventPayload,
        changeJSON: eventChangeJSON,
        customDescription: `updated Driver ${
          existingDriver.name ?? id
        }${approvalNote}`,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        status: true,
        message: hasApprovalChanges
          ? 'Driver updated successfully. Approval request sent to organizations.'
          : 'Driver updated successfully.',
        data: driver,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async documentUpload(
    id: string,
    driverDocumentInput: DriverDocumentUploadInput,
    file: any,
    user: any,
  ): Promise<any> {
    try {
      const driver = await this.driverModel.findOne({ where: { id } });
      if (!driver) {
        throw new NotFoundException('Driver not found');
      }
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }
      let fileUrl: string | null = null;
      if (file) {
        const fileDetails = {
          Key: `${file?.originalname}`,
          Body: file?.buffer,
          Bucket: `${this.config.get('AWSBUCKETNAME')}/driver_documents`,
          ContentType: file?.mimetype,
        };
        fileUrl = await this.uploadService.uploadDocument(fileDetails);
      }

      const existingDocument = await this.driverDocumentUploadModel.findOne({
        where: {
          driverID: id,
          title: driverDocumentInput.title,
        },
      });
      const documentData = {
        driverID: id,
        vendorID: user.vendorID,
        title: driverDocumentInput.title,
        url: fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
      };
      let document;
      if (existingDocument) {
        document = await this.driverDocumentUploadModel.update(documentData, {
          where: {
            id: existingDocument.id,
          },
          returning: true,
        });
      } else {
        document = await this.driverDocumentUploadModel.create(documentData);
      }
      const orgDriverMappings = await this.orgDriverModel.findAll({
        where: {
          driverID: id,
          status: 'Approved',
        },
        attributes: ['orgID'],
      });
      // Tracks whether an approval request was actually created for at
      // least one org — approval is decided per-mapping inside the loop.
      let sentForApproval = false;
      for (const mapping of orgDriverMappings) {
        const orgID = mapping.orgID;
        let driverOrgRequest = await this.driverOrgRequestModel.findOne({
          where: {
            driverID: id,
            orgID,
          },
        });

        if (!driverOrgRequest) {
          const driverData = driver.get({ plain: true });

          delete driverData.id;
          delete driverData.createdAt;
          delete driverData.updatedAt;
          delete driverData.deletedAt;

          driverOrgRequest = await this.driverOrgRequestModel.create({
            driverID: id,
            orgID,
            vendorID: user.vendorID,
            ...driverData,
          });
        }
        const existingOrgDocument =
          await this.driverOrgRequestDocumentUploadModel.findOne({
            where: {
              driverOrgRequestID: driverOrgRequest.id,
              title: driverDocumentInput.title,
            },
          });

        if (existingOrgDocument) {
          await existingOrgDocument.update({
            url: fileUrl,
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
          });
        } else {
          await this.driverOrgRequestDocumentUploadModel.create({
            driverOrgRequestID: driverOrgRequest.id,
            driverID: id,
            orgID,
            vendorID: user.vendorID,
            title: driverDocumentInput.title,
            url: fileUrl,
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
          });
        }
        const approvalEnabled =
          (await this.configurationService.getConfigValue(
            'Approval Request',
            BigInt(orgID),
          )) === 'Yes';

        if (!approvalEnabled) continue;
        const oldRecord: any = {
          documents: [],
        };

        if (existingDocument) {
          oldRecord.documents.push({
            title: existingDocument.title,
            url: existingDocument.url,
          });
        }

        const newRecord = {
          documents: [
            {
              title: driverDocumentInput.title,
              url: fileUrl,
            },
          ],
        };
        await this.approvalRequestModel.create({
          requestedBy: 'Vendor',
          vendorID: user.vendorID,
          driverID: id,
          orgID,
          requestType: 'Driver Update',
          referenceID: id,
          oldRecord,
          newRecord,
          status: 'Pending',
        });
        sentForApproval = true;
        const employee = await this.employeeModel.findOne({
          where: {
            orgID: BigInt(orgID),
            employeeType: UserType.Admin,
          },
          attributes: ['email', 'name'],
        });

        if (employee?.email) {
          const alertEmailsRaw = await this.configurationService.getConfigValue(
            'Cab Driver Edit Email Recipients',
            BigInt(orgID),
          );

          const extraEmails = alertEmailsRaw
            ? alertEmailsRaw
                .split(',')
                .map((e) => e.trim())
                .filter(Boolean)
            : [];

          const mailTo = [...new Set([employee.email, ...extraEmails])];

          await this.emailService.sendEmail({
            mailTo,
            subject: 'Driver Update Approval Request',
            templateName: 'approval-request',
            mailBody: {
              employeeName: driver.name,
              oldRecord,
              newRecord,
              deepLink: `${this.config.get(
                'ADMIN_VERIFY_URL',
              )}/approval-request?tab=pending`,
            },
            isAttachments: false,
            attachments: [],
          });
        }
      }

      const eventPayload = JSON.parse(JSON.stringify(driverDocumentInput));
      const approvalNote = sentForApproval ? ' - sent for approval' : '';
      const eventLog = {
        objectType: 'Driver',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        // Was payload: driver — the raw model instance, so expanding the
        // row listed every column on the driver record. Curated to the
        // fields relevant to what actually happened here.
        payload: {
          driverID: id,
          driverName: driver.name,
          documentTitle: driverDocumentInput.title,
          documentUrl: fileUrl,
        },
        requestPayload: eventPayload,
        customDescription: `uploaded document "${
          driverDocumentInput.title
        }" for Driver ${driver.name ?? id}${approvalNote}`,
        // Vendor uploading a document for their own Driver — not
        // trip-specific, so every org that has approved this vendor
        // should see it, not just whichever org happens to be selected
        // in the vendor's live session right now.
        visibleToAllApprovedOrgs: true,
        user,
      };
      await this.eventlogService.create(eventLog);

      return {
        message:
          'Document uploaded successfully. Approval request sent to organizations.',
        data: document,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async softDelete(id: string, user: any): Promise<GenericResponse<null>> {
    try {
      const eventLog = {
        objectType: 'Driver',
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
      const response = await this.driverModel.destroy({
        where: {
          id,
        },
      });
      if (response !== 0) {
        return {
          message: 'Driver deleted successfully',
          data: null,
        };
      } else throw new NotFoundException(`Driver not found`);
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getExpiredDrivers(user: any): Promise<any> {
    const today = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(today.getDate() + 7);

    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(today.getMonth() + 1);

    const vendorID = user.vendorID;
    const categories = [
      'licenseExpiry',
      'medFitExpiry',
      'policeClearenceExpiry',
    ];

    let expiredCount = 0;
    let withinOneWeekCount = 0;
    let withinOneMonthCount = 0;
    for (const category of categories) {
      expiredCount += await this.driverModel.count({
        where: { vendorID, [category]: { [Op.lt]: today } },
      });

      withinOneWeekCount += await this.driverModel.count({
        where: {
          vendorID,
          [category]: { [Op.gte]: today, [Op.lte]: oneWeekFromNow },
        },
      });

      // withinOneMonthCount += await this.driverModel.count({
      //   where: { vendorID,
      //     [category]: { [Op.gte]: oneWeekFromNow, [Op.lte]: oneMonthFromNow },
      //   },
      // });
      withinOneMonthCount += await this.driverModel.count({
        where: {
          vendorID,
          [category]: { [Op.gte]: today, [Op.lte]: oneMonthFromNow },
        },
      });
    }

    return {
      expired: expiredCount,
      withinOneWeek: withinOneWeekCount,
      withinOneMonth: withinOneMonthCount,
    };
  }
}
