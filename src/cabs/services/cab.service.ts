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
import { SortOrder, UserType } from 'src/shared/enums';
import { UpdateCabInput } from '../dtos/update-cab-input.dto';
// import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
// import { handleErrors } from 'src/shared/utils/format-exception';
import { Sequelize } from 'sequelize-typescript';
import { CreateCabInput } from '../dtos/create-cab-input.dto';
import { CabFilterInput } from '../dtos/cab-filter-input.dto';
import { Cab } from '../models/cab.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Driver } from 'src/drivers/models/driver.model';
import { Op } from 'sequelize';
import * as XLSX from 'xlsx';
import { ConfigService } from '@nestjs/config';
import { UploadService } from 'src/upload/services/upload.service';
import { CabDocumentUpload } from '../models/cabDocumentUpload.model';
import { CabDocumentUploadInput } from '../dtos/cab-document-upload.dto';
import { CabDocumentFilterInput } from '../dtos/cab-document-filter-input.dto';
import { CabListFilterInput } from '../dtos/cabList-filter-input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { OrganizationCab } from 'src/organization-cab/models/organizationCab.model';
import { Response } from 'express';
import * as AWS from 'aws-sdk';
import * as archiver from 'archiver';
import * as QRCode from 'qrcode';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { ApprovalRequest } from 'src/approval-request/models/approval-request.model';
import { EmailService } from 'src/email/email.service';
import { Employee } from 'src/employee/models/employee.model';
import { CabOrgRequest } from 'src/approval-request/models/cab-org-approval-req.model';
import { CabOrgRequestDocumentUpload } from 'src/approval-request/models/cab-org-req-document-upload.model';
import moment = require('moment');
import { computeRiskStatus } from 'src/shared/utils/status.util';
import { randomUUID } from 'crypto';
import { Authentication } from 'src/auth/models/authentication.model';

@Injectable()
export class CabService {
  private logger = new Logger(CabService.name);
  private s3: AWS.S3;

  constructor(
    @InjectModel(Cab)
    private cabModel: typeof Cab,
    private readonly sequelize: Sequelize,
    private eventlogService: EventLogService,
    @InjectModel(Driver)
    private driverModel: typeof Driver,
    @InjectModel(OrganizationCab)
    private orgCabModel: typeof OrganizationCab,
    @InjectModel(CabDocumentUpload)
    private cabDocumentUploadModel: typeof CabDocumentUpload,
    @InjectModel(ApprovalRequest)
    private approvalRequestModel: typeof ApprovalRequest,
    @InjectModel(Authentication)
    private authenticationModel: typeof Authentication,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(CabOrgRequest)
    private cabOrgRequestModel: typeof CabOrgRequest,
    @InjectModel(CabOrgRequestDocumentUpload)
    private cabOrgRequestDocumentUploadModel: typeof CabOrgRequestDocumentUpload,
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

  // regNo uniqueness (uniqueFieldsCheck) is scoped per-vendor. IMEI identifies
  // a physical tracker, so it must be unique across all vendors - kept as a
  // separate check rather than bending that helper's vendorID scoping.
  private async assertImeiUnique(
    imei: string | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!imei) return;
    const whereClause: any = { imei };
    if (excludeId) whereClause.id = { [Op.ne]: excludeId };
    const existing = await this.cabModel.findOne({ where: whereClause });
    if (existing) {
      throw new BadRequestException(
        'This IMEI is already assigned to another cab.',
      );
    }
  }

  // assertImeiUnique reads before writing, so two concurrent requests can both
  // pass it and let the DB settle the race. That error carries no .status, so
  // without this it falls through the catch blocks below as a 500. Re-raise it
  // as the same 400 the pre-check would have produced.
  private rethrowIfImeiUniqueViolation(error: any): void {
    if (error?.name !== 'SequelizeUniqueConstraintError') return;
    const touchesImei =
      Object.keys(error?.fields ?? {}).includes('imei') ||
      `${error?.parent?.constraint ?? ''}`.includes('imei');
    if (touchesImei) {
      throw new BadRequestException(
        'This IMEI is already assigned to another cab.',
      );
    }
  }

  async create(
    createCabInput: CreateCabInput,
    files: Express.Multer.File[],
    user: any,
  ): Promise<any> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.cabModel,
        ['regNo'],
        createCabInput,
        null,
        null,
        user?.vendorID,
      );
      handleErrors(validationErrors, 'unique');
      // Normalise '' to null before both the uniqueness check and the spread:
      // Postgres treats '' as a real value under the unique index (NULL is
      // exempt), so a second blank-IMEI cab would collide.
      if (createCabInput.imei !== undefined) {
        createCabInput.imei = this.normalizeImeiCell(createCabInput.imei);
      }
      await this.assertImeiUnique(createCabInput.imei);
      const cabData = {
        ...createCabInput,
        vendorID: user.vendorID,
      };
      delete cabData.documents;
      delete cabData.documentTitles;

      const cab = await this.cabModel.create(cabData);

      // Handle document uploads if any
      if (files && files.length > 0 && createCabInput.documentTitles) {
        const documentTitles = Array.isArray(createCabInput.documentTitles)
          ? createCabInput.documentTitles
          : [createCabInput.documentTitles];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const title = documentTitles[i];

          if (file && title) {
            const fileDetails = {
              Key: `${randomUUID()}_${file.originalname}`,
              Body: file.buffer,
              Bucket: `${this.config.get('AWSBUCKETNAME')}/cab_documents`,
              ContentType: file.mimetype,
            };
            const fileUrl = await this.uploadService.uploadDocument(
              fileDetails,
            );

            // Save document record
            await this.cabDocumentUploadModel.create({
              cabID: cab.id,
              vendorID: user.vendorID,
              title: title,
              url: fileUrl,
              fileName: file.originalname,
              fileSize: file.size,
              fileType: file.mimetype,
            });
          }
        }
      }

      return {
        message: 'Cab created successfully',
        data: cab,
      };
    } catch (error: any) {
      this.rethrowIfImeiUniqueViolation(error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    cabFilterInput: CabFilterInput,
    user: any,
  ): Promise<PaginatedList<Cab>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        expiryType,
        noOfSeats,
        fuelType,
        search,
        status,
        // vendorID,
      } = cabFilterInput;

      const currentDate = new Date();
      const oneWeekFromNow = new Date(currentDate);
      oneWeekFromNow.setDate(currentDate.getDate() + 7);

      const oneMonthFromNow = new Date(currentDate);
      oneMonthFromNow.setMonth(currentDate.getMonth() + 1);

      let whereClause: any = {};
      // whereClause[Op.or] = [];
      if (expiryType) {
        const expiryConditions = [];
        if (expiryType === 'expired') {
          expiryConditions.push({ insuranceEndDate: { [Op.lt]: currentDate } });
          expiryConditions.push({ pollutionEndDate: { [Op.lt]: currentDate } });
          expiryConditions.push({ fitnessExpiry: { [Op.lt]: currentDate } });
        } else if (expiryType === 'withinOneWeek') {
          expiryConditions.push({
            insuranceEndDate: {
              [Op.gte]: currentDate,
              [Op.lt]: oneWeekFromNow,
            },
          });
          expiryConditions.push({
            pollutionEndDate: {
              [Op.gte]: currentDate,
              [Op.lt]: oneWeekFromNow,
            },
          });
          expiryConditions.push({
            fitnessExpiry: { [Op.gte]: currentDate, [Op.lt]: oneWeekFromNow },
          });
        } else if (expiryType === 'withinOneMonth') {
          expiryConditions.push({
            insuranceEndDate: {
              [Op.gte]: currentDate,
              [Op.lt]: oneMonthFromNow,
            },
          });
          expiryConditions.push({
            pollutionEndDate: {
              [Op.gte]: currentDate,
              [Op.lt]: oneMonthFromNow,
            },
          });
          expiryConditions.push({
            fitnessExpiry: { [Op.gte]: currentDate, [Op.lt]: oneMonthFromNow },
          });
        }
        whereClause[Op.or] = expiryConditions;
      }
      if (status) {
        whereClause['status'] = status;
      }
      if (noOfSeats) {
        whereClause['noOfSeats'] = noOfSeats;
      }
      if (fuelType) {
        whereClause['fuelType'] = fuelType;
      }
      const vendorID = user.vendorID;
      if (vendorID) {
        whereClause['vendorID'] = vendorID;
      }

      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            {
              model: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              regNo: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              noOfSeats: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              fuelType: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
        whereClause.vendorID = user.vendorID;
      }
      const cab = await this.cabModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        where: whereClause,
        include: [
          // {
          //   model: Brand,
          //   as: 'brand',
          //   attributes: ['id', 'name'],
          // },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code', 'licenseExpiry', 'phone'],
          },
          {
            model: Driver,
            as: 'driver2',
            attributes: ['id', 'name', 'code', 'licenseExpiry', 'phone'],
          },
        ],
        offset: skip * take,
        subQuery: false,
      });
      return {
        totalItems: cab.count,
        items: cab.rows,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async listAllCabs(
    cabListFilterInput: CabListFilterInput,
    user: any,
  ): Promise<PaginatedList<Cab>> {
    try {
      const {
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        expiryType,
        noOfSeats,
        fuelType,
        // search,
        status,
        // vendorID,
      } = cabListFilterInput;

      const currentDate = new Date();
      const oneWeekFromNow = new Date(currentDate);
      oneWeekFromNow.setDate(currentDate.getDate() + 7);

      const oneMonthFromNow = new Date(currentDate);
      oneMonthFromNow.setMonth(currentDate.getMonth() + 1);

      const whereClause: any = {};
      // whereClause[Op.or] = [];
      if (expiryType) {
        const expiryConditions = [];
        if (expiryType === 'expired') {
          expiryConditions.push({ insuranceEndDate: { [Op.lt]: currentDate } });
          expiryConditions.push({ pollutionEndDate: { [Op.lt]: currentDate } });
          expiryConditions.push({ fitnessExpiry: { [Op.lt]: currentDate } });
        } else if (expiryType === 'withinOneWeek') {
          expiryConditions.push({
            insuranceEndDate: {
              [Op.gte]: currentDate,
              [Op.lt]: oneWeekFromNow,
            },
          });
          expiryConditions.push({
            pollutionEndDate: {
              [Op.gte]: currentDate,
              [Op.lt]: oneWeekFromNow,
            },
          });
          expiryConditions.push({
            fitnessExpiry: { [Op.gte]: currentDate, [Op.lt]: oneWeekFromNow },
          });
        } else if (expiryType === 'withinOneMonth') {
          expiryConditions.push({
            insuranceEndDate: {
              [Op.gte]: currentDate,
              [Op.lt]: oneMonthFromNow,
            },
          });
          expiryConditions.push({
            pollutionEndDate: {
              [Op.gte]: currentDate,
              [Op.lt]: oneMonthFromNow,
            },
          });
          expiryConditions.push({
            fitnessExpiry: { [Op.gte]: currentDate, [Op.lt]: oneMonthFromNow },
          });
        }
        whereClause[Op.or] = expiryConditions;
      }
      if (status) {
        whereClause['status'] = status;
      }
      if (noOfSeats) {
        whereClause['noOfSeats'] = noOfSeats;
      }
      if (fuelType) {
        whereClause['fuelType'] = fuelType;
      }
      const vendorID = user.vendorID;
      if (vendorID) {
        whereClause['vendorID'] = vendorID;
      }

      const cab = await this.cabModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        // limit: take,
        where: whereClause,
        include: [
          // {
          //   model: Brand,
          //   as: 'brand',
          //   attributes: ['id', 'name'],
          // },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code', 'licenseExpiry'],
          },
          {
            model: Driver,
            as: 'driver2',
            attributes: ['id', 'name', 'code', 'licenseExpiry'],
          },
        ],
        // offset: skip * take,
        subQuery: false,
      });

      const items = cab.rows.map((row) => {
        const plain: any = row.toJSON();
        plain.riskStatus = computeRiskStatus([
          plain.insuranceEndDate,
          plain.pollutionEndDate,
          plain.fitnessExpiry,
        ]);
        return plain;
      });
      return {
        totalItems: cab.count,
        items,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async findUnassignedUnexpiredCabs(
  //   cabFilterInput: CabFilterInput,
  //   user: any,
  // ): Promise<PaginatedList<Cab>> {
  //   try {
  //     const {
  //       take = 25,
  //       skip = 0,
  //       sortBy = 'id',
  //       sortOrder = SortOrder.ASC,
  //       noOfSeats,
  //       fuelType,
  //       status,
  //       search,
  //       orgID,
  //     } = cabFilterInput;

  //     const currentDate = new Date().toISOString().split('T')[0];
  //     const whereClause: any = {};

  //     const vendorID = user.vendorID;
  //     if (status) {
  //       whereClause.status = status;
  //     }
  //     if (noOfSeats) {
  //       whereClause.noOfSeats = noOfSeats;
  //     }
  //     if (fuelType) {
  //       whereClause.fuelType = fuelType;
  //     }
  //     if (vendorID) {
  //       whereClause.vendorID = vendorID;
  //     }
  //     if (search) {
  //       whereClause[Op.or] = [
  //         { regNo: { [Op.iLike]: `%${search}%` } },
  //         { model: { [Op.iLike]: `%${search}%` } },
  //         { noOfSeats: { [Op.iLike]: `%${search}%` } },
  //         { fuelType: { [Op.iLike]: `%${search}%` } },
  //       ];
  //     }
  //     const newOrgID = orgID || user?.orgID || user?.employee?.orgID;
  //     const expiryConditions = {
  //       insuranceEndDate: { [Op.gte]: currentDate },
  //       fitnessExpiry: { [Op.gte]: currentDate },
  //       [Op.or]: [
  //         { fuelType: 'Electric' },
  //         { pollutionEndDate: null },
  //         { pollutionEndDate: { [Op.gte]: currentDate } },
  //       ],
  //     };

  //     const { rows: cabs, count } = await this.cabModel.findAndCountAll({
  //       distinct: true,
  //       // where: whereClause,
  //       order: [[sortBy, sortOrder]],
  //       // limit: take,
  //       // offset: skip * take,
  //       where: {
  //         ...whereClause,
  //         ...expiryConditions,
  //       },
  //       include: [
  //         {
  //           model: Driver,
  //           as: 'driver',
  //           attributes: ['id', 'name', 'code', 'licenseExpiry'],
  //         },
  //         {
  //           model: Driver,
  //           as: 'driver2',
  //           attributes: ['id', 'name', 'code', 'licenseExpiry'],
  //         },
  //       ],
  //     });
  //     if (cabs.length === 0) {
  //       return { items: [], totalItems: 0 };
  //     }
  //     // Find orgCabs already assigned
  //     const assignedOrgCabs = await this.orgCabModel.findAll({
  //       where: {
  //         orgID: newOrgID,
  //         vendorID,
  //         cabID: { [Op.in]: cabs.map((c) => c.id) },
  //       },
  //       // attributes: ['cabID'],
  //     });
  //     const assignedCabIds = assignedOrgCabs.map((o: any) => o.cabID);
  //     // Filter out already assigned cabs
  //     const availableCabs = cabs.filter(
  //       (cab: any) => !assignedCabIds.includes(cab.id),
  //     );

  //     const paginatedCabs = availableCabs.slice(skip * take, skip * take + take);

  //     return {
  //       items: paginatedCabs,
  //       totalItems: availableCabs.length,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async findUnassignedUnexpiredCabs(
    cabFilterInput: CabFilterInput,
    user: any,
  ): Promise<PaginatedList<Cab>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        noOfSeats,
        fuelType,
        status,
        search,
        orgID,
      } = cabFilterInput;

      const currentDate = new Date().toISOString().split('T')[0];
      const whereClause: any = {};

      const vendorID = user.vendorID;
      if (status) {
        whereClause.status = status;
      }
      if (noOfSeats) {
        whereClause.noOfSeats = noOfSeats;
      }
      if (fuelType) {
        whereClause.fuelType = fuelType;
      }
      if (vendorID) {
        whereClause.vendorID = vendorID;
      }
      // Handle search separately to avoid conflicts with other filters
      let searchCondition = {};
      if (search) {
        searchCondition = {
          [Op.or]: [
            { regNo: { [Op.iLike]: `%${search}%` } },
            { model: { [Op.iLike]: `%${search}%` } },
            { noOfSeats: { [Op.iLike]: `%${search}%` } },
            { fuelType: { [Op.iLike]: `%${search}%` } },
          ],
        };
      }

      const newOrgID = orgID || user?.orgID || user?.employee?.orgID;

      // expiry filter
      const expiryConditions = {
        insuranceEndDate: { [Op.gte]: currentDate },
        fitnessExpiry: { [Op.gte]: currentDate },
        [Op.or]: [
          { fuelType: 'Electric' },
          { pollutionEndDate: { [Op.gte]: currentDate } },
        ],
      };

      // Step 1: get assigned cab IDs for this org
      const assignedOrgCabs = await this.orgCabModel.findAll({
        where: {
          orgID: newOrgID,
          // vendorID,
          status: { [Op.ne]: 'Rejected' },
        },
        attributes: ['cabID'],
        include: [
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo'],
          },
        ],
        raw: true,
      });
      const assignedCabIds = assignedOrgCabs.map((o: any) => o.cabID);
      const assignedRegNos = assignedOrgCabs.map((o: any) => o['cab.regNo']);

      // Step 2: fetch only unexpired + not assigned cabs
      const finalWhereClause = {
        ...whereClause,
        ...expiryConditions,
        ...searchCondition,
        ...(assignedCabIds.length > 0
          ? { id: { [Op.notIn]: assignedCabIds } }
          : {}), // only apply if there are assigned IDs
        ...(assignedRegNos.length > 0
          ? { regNo: { [Op.notIn]: assignedRegNos } }
          : {}),
      };

      const { rows: cabs, count } = await this.cabModel.findAndCountAll({
        distinct: true,
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        where: finalWhereClause,
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code', 'licenseExpiry'],
          },
          {
            model: Driver,
            as: 'driver2',
            attributes: ['id', 'name', 'code', 'licenseExpiry'],
          },
        ],
      });

      return {
        items: cabs,
        totalItems: count,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getCabDocuments(
    cabDocumentFilterInput: CabDocumentFilterInput,
    user: any,
  ): Promise<PaginatedList<CabDocumentUpload>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        cabID,
      } = cabDocumentFilterInput;
      const whereClause: any = {};
      if (cabID) {
        whereClause.cabID = cabID;
      }
      whereClause.vendorID = user.vendorID;
      const cab = await this.cabDocumentUploadModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        where: whereClause,
        include: [
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo'],
          },
        ],
        offset: skip * take,
        subQuery: false,
      });
      return {
        totalItems: cab.count,
        items: cab.rows,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async downloadCabDocuments(id: any, res: Response, user: any) {
  //   const docs = await this.cabDocumentUploadModel.findAll({
  //     where: { cabID: id, vendorID: user.vendorID },
  //   });

  //   if (!docs.length) {
  //     throw new NotFoundException('No documents found for this cab');
  //   }
  //   // Prepare response headers
  //   res.setHeader('Content-Type', 'application/zip');
  //   res.setHeader(
  //     'Content-Disposition',
  //     `attachment; filename=cab_${id}_documents.zip`,
  //   );
  //   const archive = archiver('zip', { zlib: { level: 9 } });
  //   archive.pipe(res);

  //   for (const doc of docs) {
  //     try {
  //       const key = decodeURIComponent(
  //         doc.url.split('.amazonaws.com/')[1], // extract "cab_documents/"
  //       );
  //       const stream = this.s3
  //         .getObject({
  //           Bucket: process.env.AWSBUCKETNAME,
  //           Key: key,
  //         })
  //         .createReadStream();

  //       archive.append(stream, {
  //         name: key.split('/').pop(), // filename only
  //       });
  //     } catch (error) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //     }
  //   }
  //   await archive.finalize();
  // }

  async downloadCabDocuments(id: any, user: any, res: Response) {
    const docs = await this.cabDocumentUploadModel.findAll({
      where: { cabID: id, vendorID: user.vendorID },
    });

    if (!docs.length) {
      throw new NotFoundException(`No documents found for this cab`);
    }

    // 3. Set headers immediately (before any async operations)
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=cab_${id}_documents.zip`,
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
          // Don't throw - let archiver continue with other files
        });

        archive.append(stream, {
          name: key.split('/').pop(),
        });
      } catch (error) {
        // console.error(`Error processing file ${doc.url}:`, error);
        // Continue with other files
      }
    }

    // 7. Finalize - wrap in try-catch to prevent any throws after headers
    try {
      await archive.finalize();
    } catch (error) {
      // console.error('Error finalizing archive:', error);
      res.end();
    }
  }

  async findOne(id: string): Promise<GenericResponse<Cab>> {
    try {
      const cab = await this.cabModel.findOne({
        where: { id },
        include: [
          // {
          //   model: Brand,
          //   as: 'brand',
          //   attributes: ['id', 'name'],
          // },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code', 'licenseExpiry'],
          },
          {
            model: Driver,
            as: 'driver2',
            attributes: ['id', 'name', 'code', 'licenseExpiry'],
          },
        ],
      });
      if (cab)
        return {
          message: 'Cab found',
          data: cab,
        };
      else throw new NotFoundException('Invalid Cab id');
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findCabWithBrandID(brandId: string): Promise<Cab> {
    const cab = await this.cabModel.findOne({
      where: {
        brandID: brandId,
      },
    });
    return cab;
  }

  // async update(
  //   id: string,
  //   updateCabInput: UpdateCabInput,
  //   user: any,
  // ): Promise<any> {
  //   try {
  //     const cabById = await this.findOne(id);

  //     const cab = await this.cabModel.update(updateCabInput, {
  //       where: { id },
  //       returning: true,
  //     });
  //     const eventPayload = JSON.parse(JSON.stringify(updateCabInput));
  //     const eventLog = {
  //       objectType: 'Cab',
  //       changeType: 'edit',
  //       objectID: id,
  //       authID: user.id,
  //       orgID: user.orgID,
  //       updatedBy: user.name,
  //       payload: cabById.data,
  //       requestPayload: eventPayload,
  //     };
  //     this.eventlogService.create(eventLog);
  //     return {
  //       status: true,
  //       message: 'Cab updated successfully',
  //       data: cab?.[1]?.[0],
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async update(
    id: string,
    updateCabInput: UpdateCabInput,
    user: any,
    files?: Express.Multer.File[],
  ): Promise<any> {
    try {
      const cabData = { ...updateCabInput };
      delete cabData.documents;
      delete cabData.documentTitles;
      // '' means "clear the IMEI" - normalise to null so the column never holds
      // an empty string. Gated on !== undefined rather than key presence:
      // assigning unconditionally would add imei: null to every update that never
      // mentioned IMEI, wiping the tracker binding on unrelated cab edits, and
      // undefined is the one value that can never mean "clear it" (a caller
      // clearing the field sends '' over multipart or null over JSON).
      if (cabData.imei !== undefined) {
        cabData.imei = this.normalizeImeiCell(cabData.imei);
      }
      const validationErrors = await uniqueFieldsCheck(
        this.cabModel,
        ['regNo'],
        updateCabInput,
        id,
        null,
        user.vendorID,
      );
      handleErrors(validationErrors, 'unique');
      await this.assertImeiUnique(cabData.imei, id);
      if (!('driverID' in updateCabInput)) {
        cabData.driverID = null;
      }
      if (!('driver2ID' in updateCabInput)) {
        cabData.driver2ID = null;
      }
      if (cabData.driverID || cabData.driver2ID) {
        const duplicateEntries = await this.cabModel.findAll({
          where: {
            vendorID: user.vendorID,
            id: { [Op.ne]: id }, // exclude current cab
            [Op.or]: [
              { driverID: cabData.driverID },
              { driver2ID: cabData.driverID },
              { driverID: cabData.driver2ID },
              { driver2ID: cabData.driver2ID },
            ],
          },
        });
        if (duplicateEntries.length > 0) {
          const messages = duplicateEntries.flatMap((cab) => {
            const conflicts: string[] = [];
            if (cabData.driverID) {
              if (cab.driverID === cabData.driverID) {
                conflicts.push(
                  `Driver 1 is already tagged as Driver 1 in Cab ${cab.regNo}`,
                );
              }
              if (cab.driver2ID === cabData.driverID) {
                conflicts.push(
                  `Driver 1 is already tagged as Driver 2 in Cab ${cab.regNo}`,
                );
              }
            }
            if (cabData.driver2ID) {
              if (cab.driverID === cabData.driver2ID) {
                conflicts.push(
                  `Driver 2 is already tagged as Driver 1 in Cab ${cab.regNo}`,
                );
              }
              if (cab.driver2ID === cabData.driver2ID) {
                conflicts.push(
                  `Driver 2 is already tagged as Driver 2 in Cab ${cab.regNo}`,
                );
              }
            }
            return conflicts;
          });
          if (messages.length > 0) {
            throw new BadRequestException(messages.join('\n'));
          }
        }
      }
      // Fetch existing cab
      const existingCab = await this.cabModel.findOne({
        where: { id },
      });
      if (!existingCab) {
        throw new NotFoundException('Cab not found');
      }
      const oldRecord: Record<string, any> = {};
      const newRecord: Record<string, any> = {};
      const currentData = existingCab.get({ plain: true });
      const dateFields = [
        'taxExpiry',
        'permitExpiry',
        'fitnessExpiry',
        'insuranceEndDate',
        'pollutionEndDate',
      ];
      const ignoreFields = ['documents', 'documentTitles', 'existingDocuments'];
      const approvalFields = [
        'insuranceEndDate',
        'pollutionEndDate',
        'permitExpiry',
        'taxExpiry',
        'fitnessExpiry',
      ];
      const approvalDocumentTitles = [
        'Insurance Document',
        'Pollution Document',
        'Permit Document',
        'Tax Document',
        'Cab Fitness Document',
      ];
      const normalizeValue = (key: string, value: any) => {
        if (value === null || value === undefined) return value;
        if (dateFields.includes(key)) {
          return moment(value).format('YYYY-MM-DD');
        }
        return value;
      };
      // Compare all normal fields and creating old and new record
      Object.keys(cabData).forEach((key) => {
        if (!approvalFields.includes(key)) return; //only approval required fields to be included
        if (ignoreFields.includes(key)) return;
        const oldValue = normalizeValue(key, currentData[key]);
        const newValue = normalizeValue(key, cabData[key]);
        if (oldValue !== newValue) {
          oldRecord[key] = oldValue;
          newRecord[key] = newValue;
        }
      });
      //always file upload  for cabDocumentUpload table
      //pushing the documnt change to old and new record
      const uploadedDocuments: any[] = [];
      if (files?.length && updateCabInput.documentTitles?.length) {
        const documentTitles = Array.isArray(updateCabInput.documentTitles)
          ? updateCabInput.documentTitles
          : [updateCabInput.documentTitles];
        const existingDocuments = await this.cabDocumentUploadModel.findAll({
          where: { cabID: id },
          attributes: ['title', 'url'],
        });
        const existingDocMap = existingDocuments.reduce((acc, doc: any) => {
          acc[doc.title] = doc.url;
          return acc;
        }, {});
        oldRecord.documents ??= [];
        newRecord.documents ??= [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const title = documentTitles[i];
          if (!file || !title) continue;
          // Upload only once
          const fileDetails = {
            Key: file.originalname,
            Body: file.buffer,
            Bucket: `${this.config.get('AWSBUCKETNAME')}/cab_documents`,
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
        const orgCabMappings = await this.orgCabModel.findAll({
          where: {
            cabID: id,
            status: 'Approved',
          },
          attributes: ['orgID'],
        });
        const authRecord = await this.authenticationModel.findOne({
          where: { id: user.id },
          attributes: ['email'],
        });
        const approvalRequests = [];
        for (const mapping of orgCabMappings) {
          const approvalEnabled =
            (await this.configurationService.getConfigValue(
              'Approval Request',
              BigInt(mapping.orgID),
            )) === 'Yes';
          if (!approvalEnabled) continue;
          const lastRequest = await this.approvalRequestModel.findOne({
            where: {
              cabID: id,
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
            cabID: id,
            orgID: mapping.orgID,
            requestType: 'Cab Update',
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
              mailTo,
              subject: 'Cab Update Approval Request',
              templateName: 'cab-approval-request',
              mailBody: {
                registerNumber: cabData?.regNo,
                vendorName: user?.name,
                requestedByEmail: authRecord?.email,
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
          const cabOrgRequest = await this.cabOrgRequestModel.findOne({
            where: {
              cabID: id,
              orgID: mapping.orgID,
            },
          });
          if (!cabOrgRequest) {
            const cabSnapshot = existingCab.get({ plain: true });
            delete cabSnapshot.id;
            delete cabSnapshot.createdAt;
            delete cabSnapshot.updatedAt;
            delete cabSnapshot.deletedAt;
            await this.cabOrgRequestModel.create({
              cabID: id,
              orgID: mapping.orgID,
              ...cabSnapshot,
            });
            // Copy all existing cab documents
            const cabDocuments = await this.cabDocumentUploadModel.findAll({
              where: { cabID: id },
            });
            for (const doc of cabDocuments) {
              const existingDoc =
                await this.cabOrgRequestDocumentUploadModel.findOne({
                  where: {
                    cabOrgRequestID: cabOrgRequest.id,
                    title: doc.title,
                  },
                });
              if (!existingDoc) {
                await this.cabOrgRequestDocumentUploadModel.create({
                  cabOrgRequestID: cabOrgRequest.id,
                  cabID: id,
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
      // Always update the cab table
      await this.cabModel.update(cabData, {
        where: { id },
      });
      if (uploadedDocuments.length > 0) {
        const titles = uploadedDocuments.map((doc) => doc.title);
        await this.cabDocumentUploadModel.destroy({
          where: {
            cabID: id,
            title: {
              [Op.in]: titles,
            },
          },
        });
        await this.cabDocumentUploadModel.bulkCreate(
          uploadedDocuments.map((doc) => ({
            cabID: id,
            vendorID: user.vendorID,
            title: doc.title,
            url: doc.url,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            fileType: doc.fileType,
          })),
        );
      }
      const orgCabUpdateData = { ...cabData };
      approvalFields.forEach((field) => {
        delete orgCabUpdateData[field];
      });
      const orgCabRequests = await this.cabOrgRequestModel.findAll({
        where: {
          cabID: id,
        },
      });
      for (const orgCabRequest of orgCabRequests) {
        await orgCabRequest.update(orgCabUpdateData);
      }
      const nonApprovalDocs = uploadedDocuments.filter(
        (doc) => !approvalDocumentTitles.includes(doc.title),
      );
      for (const orgCabRequest of orgCabRequests) {
        for (const doc of nonApprovalDocs) {
          await this.cabOrgRequestDocumentUploadModel.destroy({
            where: {
              cabOrgRequestID: orgCabRequest.id,
              title: doc.title,
            },
          });
          await this.cabOrgRequestDocumentUploadModel.create({
            cabOrgRequestID: orgCabRequest.id,
            cabID: id,
            orgID: orgCabRequest.orgID,
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

      // Full field-level diff — not just the 5 approval-gated fields used
      // above for the approval-request flow, but every field cabData
      // actually touched, so the log reflects everything that changed
      // (regNo, driverID reassignment, imei, etc.), not just the
      // org-approval subset.
      const eventChangeJSON: Record<string, { OldValue: any; newValue: any }> =
        {};
      for (const key of Object.keys(cabData)) {
        if (ignoreFields.includes(key)) continue;
        const oldValue = normalizeValue(key, currentData[key]);
        const newValue = normalizeValue(key, cabData[key]);
        if (oldValue !== newValue) {
          eventChangeJSON[key] = {
            OldValue: dateFields.includes(key)
              ? formatDateOnly(currentData[key])
              : currentData[key],
            newValue: dateFields.includes(key)
              ? formatDateOnly(cabData[key])
              : cabData[key],
          };
        }
      }
      if (uploadedDocuments.length > 0) {
        eventChangeJSON['Documents'] = {
          OldValue: 'N/A',
          newValue: uploadedDocuments.map((doc) => doc.title).join(', '),
        };
      }
      // Was missing entirely from a previous edit — eventChangeJSON was
      // being built but never actually logged. Restored, with the date
      // formatting and vendor-wide visibility fixes from earlier.
      const approvalNote = hasApprovalChanges ? ' - sent for approval' : '';
      const eventLog = {
        objectType: 'Cab',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        payload: {
          cabID: id,
          regNo: cabData?.regNo ?? existingCab.regNo,
        },
        requestPayload: JSON.parse(JSON.stringify(updateCabInput)),
        changeJSON: eventChangeJSON,
        customDescription: `updated Cab ${
          cabData?.regNo ?? existingCab.regNo
        }${approvalNote}`,
        visibleToAllApprovedOrgs: true,
        user,
      };
      this.eventlogService
        .create(eventLog)
        .catch((err) => this.logger.error('Cab update event log failed', err));

      return {
        status: true,
        message: hasApprovalChanges
          ? 'Cab updated successfully. Approval request sent to organizations.'
          : 'Cab updated successfully.',
      };
    } catch (error: any) {
      this.rethrowIfImeiUniqueViolation(error);
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async documentUpload(
    id: string,
    cabDocumentInput: CabDocumentUploadInput,
    file: any,
    user: any,
  ): Promise<any> {
    try {
      const cab = await this.cabModel.findOne({ where: { id } });
      if (!cab) {
        throw new NotFoundException('Cab not found');
      }
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }
      let fileUrl: string | null = null;
      if (file) {
        const fileDetails = {
          Key: `${file?.originalname}`,
          Body: file?.buffer,
          Bucket: `${this.config.get('AWSBUCKETNAME')}/cab_documents`,
          ContentType: file?.mimetype,
        };
        fileUrl = await this.uploadService.uploadDocument(fileDetails);
      }

      const existingDocument = await this.cabDocumentUploadModel.findOne({
        where: {
          cabID: id,
          title: cabDocumentInput.title,
        },
      });
      const documentData = {
        cabID: id,
        vendorID: user.vendorID,
        title: cabDocumentInput.title,
        url: fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
      };
      let document;
      if (existingDocument) {
        document = await this.cabDocumentUploadModel.update(documentData, {
          where: {
            id: existingDocument.id,
          },
          returning: true,
        });
      } else {
        document = await this.cabDocumentUploadModel.create(documentData);
      }
      // Get all approved organizations for this cab
      const orgCabMappings = await this.orgCabModel.findAll({
        where: {
          cabID: id,
          status: 'Approved',
        },
        attributes: ['orgID'],
      });
      let sentForApproval = false;
      for (const mapping of orgCabMappings) {
        const orgID = mapping.orgID;

        // Create CabOrgRequest if it doesn't exist
        let cabOrgRequest = await this.cabOrgRequestModel.findOne({
          where: {
            cabID: id,
            orgID,
          },
        });

        if (!cabOrgRequest) {
          const cabData = cab.get({ plain: true });

          delete cabData.id;
          delete cabData.createdAt;
          delete cabData.updatedAt;
          delete cabData.deletedAt;

          cabOrgRequest = await this.cabOrgRequestModel.create({
            cabID: id,
            orgID,
            vendorID: user.vendorID,
            ...cabData,
          });
        }

        // Update/Create organization document
        const existingOrgDocument =
          await this.cabOrgRequestDocumentUploadModel.findOne({
            where: {
              cabOrgRequestID: cabOrgRequest.id,
              title: cabDocumentInput.title,
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
          await this.cabOrgRequestDocumentUploadModel.create({
            cabOrgRequestID: cabOrgRequest.id,
            cabID: id,
            orgID,
            vendorID: user.vendorID,
            title: cabDocumentInput.title,
            url: fileUrl,
            fileName: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
          });
        }

        // Check Approval Request configuration
        const approvalEnabled =
          (await this.configurationService.getConfigValue(
            'Approval Request',
            BigInt(orgID),
          )) === 'Yes';

        if (!approvalEnabled) continue;

        // Build approval payload
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
              title: cabDocumentInput.title,
              url: fileUrl,
            },
          ],
        };

        await this.approvalRequestModel.create({
          requestedBy: 'Vendor',
          vendorID: user.vendorID,
          cabID: id,
          orgID,
          requestType: 'Cab Update',
          referenceID: id,
          oldRecord,
          newRecord,
          status: 'Pending',
        });
        sentForApproval = true;

        // Send mail
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
            subject: 'Cab Update Approval Request',
            templateName: 'approval-request',
            mailBody: {
              employeeName: cab.regNo,
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

      const eventPayload = JSON.parse(JSON.stringify(cabDocumentInput));
      const approvalNote = sentForApproval ? ' - sent for approval' : '';
      const eventLog = {
        objectType: 'Cab',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        updatedBy: user.name,
        // Was payload: cab — the raw model instance, so expanding the row
        // listed every column on the cab record. Curated to the fields
        // relevant to what actually happened here.
        payload: {
          cabID: id,
          regNo: cab.regNo,
          documentTitle: cabDocumentInput.title,
          documentUrl: fileUrl,
        },
        requestPayload: eventPayload,
        customDescription: `uploaded document "${
          cabDocumentInput.title
        }" for Cab ${cab.regNo ?? id}${approvalNote}`,
        // Vendor uploading a document for their own Cab — not
        // trip-specific, so every org that has approved this vendor
        // should see it, not just whichever org happens to be selected
        // in the vendor's live session right now.
        visibleToAllApprovedOrgs: true,
        user,
      };
      await this.eventlogService.create(eventLog);

      return {
        message:
          'Document uploaded successfully.Approval request sent to organizations.',
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
        objectType: 'Cab',
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
      const response = await this.cabModel.destroy({
        where: {
          id,
        },
      });
      if (response !== 0) {
        return {
          message: 'Cab deleted successfully',
          data: null,
        };
      } else throw new NotFoundException(`Cab not found`);
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getExpiredCabs(user: any): Promise<any> {
    const today = new Date();
    const oneWeekFromNow = new Date(today);
    oneWeekFromNow.setDate(today.getDate() + 7);

    const oneMonthFromNow = new Date(today);
    oneMonthFromNow.setMonth(today.getMonth() + 1);

    const vendorID = user.vendorID;
    const categories = [
      'insuranceEndDate',
      'pollutionEndDate',
      'fitnessExpiry',
    ];

    let expiredCount = 0;
    let withinOneWeekCount = 0;
    let withinOneMonthCount = 0;

    for (const category of categories) {
      expiredCount += await this.cabModel.count({
        where: { vendorID, [category]: { [Op.lt]: today } },
      });

      withinOneWeekCount += await this.cabModel.count({
        where: {
          vendorID,
          [category]: { [Op.gte]: today, [Op.lt]: oneWeekFromNow },
        },
      });

      withinOneMonthCount += await this.cabModel.count({
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

  async importCabsheet(file: Buffer, user: any): Promise<object> {
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
      // Long digit strings (IMEI) can come back mangled into scientific
      // notation through the raw:false formatted-string conversion above.
      // A separate raw:true pass keeps the underlying number/string intact
      // for the IMEI column only; every other field still uses raw:false.
      const sheetDataObjectsRaw: any = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        { raw: true },
      );
      let validatedData: any = null;
      try {
        validatedData = await this.validateCabSheetData(
          sheetDataObjects,
          user,
          sheetDataObjectsRaw,
        );
      } catch (error) {
        throw new BadRequestException(
          `Data validation failed: ${error.message}`,
        );
      }
      const cabDetailsArray = [];
      for (const { row } of validatedData) {
        const {
          'Driver1 Phone': driver1,
          'Driver2 Phone': driver2,
          'Register Number': regNo,
          'RC Owner': rcOwner,
          // Color: color,
          'No Of Seats': noOfSeats,
          'Pollution End Date': pollutionEndDate,
          // 'Manufacturing Date': manufacturingDate,
          // Brand: brand,
          Model: model,
          'Fuel Type': fuelType,
          // 'Insurance Number': insuranceNumber,
          // 'Insurance Provider': insuranceProvider,
          'Insurance End Date': insuranceEndDate,
          'Permit Expiry': permitExpiry,
          'Tax Expiry': taxExpiry,
          'Fitness Expiry': fitnessExpiry,
          imei,
        } = row;
        const formtPollEndDate = await this.formatExcelDate(pollutionEndDate);
        // const formtManfDate = await this.formatExcelDate(manufacturingDate);
        const formtInsEndDate = await this.formatExcelDate(insuranceEndDate);
        const formtPermitExpDate = await this.formatExcelDate(permitExpiry);
        const formtTaxExpDate = await this.formatExcelDate(taxExpiry);
        const formtFitnessExpDate = await this.formatExcelDate(fitnessExpiry);

        // const brandDetails = await this.brandModel.findOne({
        //   where: { name: brand },
        // });
        // const brandID = brandDetails ? brandDetails.id : null;
        let driverID = null;
        let driver2ID = null;
        if (driver1) {
          const driver1Details = await this.driverModel.findOne({
            where: { phone: driver1, vendorID: user.vendorID },
          });
          driverID = driver1Details ? driver1Details.id : null;
        }
        if (driver2) {
          const driver2Details = await this.driverModel.findOne({
            where: { phone: driver2, vendorID: user.vendorID },
          });
          driver2ID = driver2Details ? driver2Details.id : null;
        }
        cabDetailsArray.push({
          vendorID: user.vendorID,
          driverID,
          driver2ID,
          regNo,
          imei,
          rcOwner,
          // color,
          noOfSeats,
          pollutionEndDate: formtPollEndDate,
          // manufacturingDate: formtManfDate,
          // brandID,
          model,
          fuelType,
          // insuranceNumber,
          // insuranceProvider,
          insuranceEndDate: formtInsEndDate,
          permitExpiry: formtPermitExpDate,
          taxExpiry: formtTaxExpDate,
          fitnessExpiry: formtFitnessExpDate,
        });
      }
      const transaction = await this.sequelize.transaction();
      try {
        await this.cabModel.bulkCreate(cabDetailsArray, { transaction });
        await transaction.commit();
        return {
          message: `${validatedData?.length} cabs created successfully.`,
        };
      } catch (error: any) {
        await transaction.rollback();
        throw new BadRequestException(`Import failed: ${error.message}`);
      }
      //   return;
    } catch (error: any) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  private async formatExcelDate(inputDate: any): Promise<any> {
    if (!inputDate) return null; // Handle empty or undefined values
    const formattedDate = moment(
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
      ],
      true,
    ).format('YYYY-MM-DD');

    return formattedDate === 'Invalid date' ? null : formattedDate;
  }

  // Excel numeric cells for long digit strings (IMEI) can be handed back by
  // SheetJS's raw:false formatted-string conversion in scientific notation
  // (e.g. 8.6307E+14), independent of column width. The raw:true value keeps
  // full precision for numeric cells - safe here since a 15-digit IMEI is
  // well under Number.MAX_SAFE_INTEGER, so String(rawValue) never produces
  // an exponent. Cells stored as Excel Text (leading apostrophe, or a
  // pre-formatted Text column) already come back as a string under
  // raw:true too, so both cases funnel through the same trim().
  private normalizeImeiCell(rawValue: any): string | null {
    if (rawValue === undefined || rawValue === null) return null;
    const asString =
      typeof rawValue === 'number' ? String(rawValue) : String(rawValue).trim();
    return asString === '' ? null : asString;
  }

  private async validateCabSheetData(
    sheetData: any[],
    user: any,
    sheetDataRaw: any[],
  ): Promise<any[]> {
    try {
      const validatedData: any[] = [];
      const enteredRegNos = new Set<string>();
      const enteredImeis = new Set<string>();

      for (let index = 0; index < sheetData.length; index++) {
        const row = sheetData[index];

        try {
          const {
            'Driver1 Phone': driver1,
            'Driver2 Phone': driver2,
            'Register Number': rawRegNo,
            'No Of Seats': noOfSeats,
            'Pollution End Date': pollutionEndDate,
            // 'Manufacturing Date': manufacturingDate,
            // Brand: brand,
            'Fuel Type': fuelType,
            // 'Insurance Number': insuranceNumber,
            // 'Insurance Provider': insuranceProvider,
            'Insurance End Date': insuranceEndDate,
            'Fitness Expiry': fitnessExpiry,
            'Tax Expiry': taxExpiry,
            'Permit Expiry': permitExpiry,
          } = row;
          const regNo = rawRegNo?.trim();

          // Check duplicates inside Excel
          if (regNo && enteredRegNos.has(regNo)) {
            throw new Error(
              `Row ${
                index + 2
              } has a duplicate Register Number '${regNo}' in the file.`,
            );
          }
          if (regNo) enteredRegNos.add(regNo);

          const existingCab = await this.cabModel.findOne({
            where: { regNo: regNo, vendorID: user.vendorID },
          });

          if (existingCab) {
            throw new Error(
              `Row ${
                index + 2
              } contains a registration number of an existing cab.`,
            );
          }

          // IMEI is optional - blank cells are valid, many cabs have no
          // GPS device. Only validate/dedupe when a value is present.
          const imei = this.normalizeImeiCell(sheetDataRaw[index]?.['IMEI']);
          if (imei) {
            if (!/^\d{15}$/.test(imei)) {
              throw new Error(
                `Row ${
                  index + 2
                } contains an invalid IMEI '${imei}'. IMEI must be exactly 15 digits.`,
              );
            }
            if (enteredImeis.has(imei)) {
              throw new Error(
                `Row ${index + 2} has a duplicate IMEI '${imei}' in the file.`,
              );
            }
            enteredImeis.add(imei);

            try {
              await this.assertImeiUnique(imei);
            } catch {
              throw new Error(
                `Row ${
                  index + 2
                } contains an IMEI that is already assigned to another cab.`,
              );
            }
          }
          row.imei = imei;

          if (driver1) {
            const driver1Details = await this.driverModel.findOne({
              where: { phone: driver1, vendorID: user.vendorID },
            });
            if (!driver1Details) {
              throw new Error(
                `Row ${
                  index + 2
                } contains an invalid driver1 phone number. Driver not found for driver1 phone number: '${driver1}'.`,
              );
            }
          }
          if (driver2) {
            const driver2Details = await this.driverModel.findOne({
              where: { phone: driver2, vendorID: user.vendorID },
            });
            if (!driver2Details) {
              throw new Error(
                `Row ${
                  index + 2
                } contains an invalid driver2 phone number. Driver not found for driver2 phone number: '${driver2}'.`,
              );
            }
          }
          if (driver1 && driver2 && driver1 === driver2) {
            throw new Error(
              `Row ${
                index + 2
              } contains same phone number for Driver1 and Driver2.`,
            );
          }

          if (
            !regNo ||
            !noOfSeats ||
            // !pollutionEndDate ||
            // !manufacturingDate ||
            // !brand ||
            !fuelType ||
            // !insuranceNumber ||
            // !insuranceProvider ||
            !insuranceEndDate ||
            !fitnessExpiry
          ) {
            throw new Error(
              `Row ${
                index + 2
              } is missing required fields: Fuel Type, No Of Seats, Register Number, Insurance End Date and Fitness Expiry are mandatory.`,
            );
          }
          if (!regNo || regNo.length < 4) {
            throw new BadRequestException(
              `Invalid registration number at row ${
                index + 2
              }. Must be at least 4 characters long.`,
            );
          }

          const validateFutureDate = (dateValue, fieldName) => {
            const today = moment().startOf('day');
            const formattedDate = moment(
              dateValue,
              ['M/D/YY', 'M/D/YYYY', 'DD/MM/YYYY'],
              true,
            );
            if (formattedDate.isSameOrBefore(today, 'day')) {
              throw new Error(
                `Row ${
                  index + 2
                } contains an expired ${fieldName}. The date should be greater than today.`,
              );
            }
          };
          if (fuelType === 'Electric') {
            validateFutureDate(insuranceEndDate, 'Insurance End Date');
            validateFutureDate(fitnessExpiry, 'Fitness Expiry');
          } else {
            if (!pollutionEndDate) {
              throw new Error(
                `Row ${
                  index + 2
                } is missing required fields: Pollution End Date is mandatory for non-electric cabs.`,
              );
            }
            validateFutureDate(pollutionEndDate, 'Pollution End Date');
            validateFutureDate(insuranceEndDate, 'Insurance End Date');
            validateFutureDate(fitnessExpiry, 'Fitness Expiry');
            taxExpiry ? validateFutureDate(taxExpiry, 'Tax Expiry') : null;
            permitExpiry
              ? validateFutureDate(permitExpiry, 'Permit Expiry')
              : null;
          }
          row.regNo = regNo;
          validatedData.push({ row });
        } catch (rowError) {
          throw new BadRequestException(rowError.message);
        }
      }

      return validatedData;
    } catch (err) {
      throw new BadRequestException(`Import failed: ${err.message}`);
    }
  }

  async generateQR(id: string, user: any): Promise<GenericResponse<any>> {
    try {
      const cab = await this.cabModel.findOne({
        where: { id, vendorID: user.vendorID },
      });

      if (!cab) {
        throw new NotFoundException('Invalid Cab id');
      }
      // const timestamp = new Date().toISOString();
      const timestampIST = moment()
        .tz('Asia/Kolkata')
        .format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      // const qrPayload = {
      //   cabId: cab.id,
      //   regNo: cab.regNo,
      //   timestamp: new Date().toISOString(),
      // };
      const qrPayload = `cab_${cab.id}_${cab.regNo}_${timestampIST}`;

      const qrCode = await QRCode.toDataURL(JSON.stringify(qrPayload), {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        margin: 2,
        width: 300,
      });

      return {
        message: 'Cab QR generated successfully',
        data: {
          cab,
          qrCode,
        },
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
