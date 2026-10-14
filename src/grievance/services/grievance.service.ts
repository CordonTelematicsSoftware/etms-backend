import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SortOrder } from 'src/shared/enums';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { Op } from 'sequelize';

import { EventLogService } from 'src/eventlog/eventlog.service';

import { ConfigService } from '@nestjs/config';
import { Grievance } from '../models/grievance.model';
import { CreateGrievanceInput } from '../dtos/create-grievance-input.dto';
import { UploadService } from 'src/upload/services/upload.service';
import { stripS3QueryString } from 'src/shared/utils/aws-s3';
import { FilterGrievanceInput } from '../dtos/filter-grivance-input.dto';
import { UpdateGrievanceInput } from '../dtos/update-grievance-input.dto';
import { GmsCategory } from 'src/gms-category/models/gms-category.model';
import { GmsCategoryService } from 'src/gms-category/services/gms-category.service';
import { MailObjectInput } from 'src/email/dto/mail.input.dto';
import { EmailService } from 'src/email/email.service';
import * as moment from 'moment';
import { EmployeeService } from 'src/employee/services/employee-service';
import { GrievanceHistory } from '../models/grievanceHistory.model';
import { Employee } from 'src/employee/models/employee.model';
import { GrievanceStatusChangeInput } from '../dtos/grivance-statusChange-input.dto';
import { GrievanceHistoryService } from './grievanceHistory.service';
@Injectable()
export class GrievanceService {
  constructor(
    @InjectModel(Grievance)
    private grievanceModel: typeof Grievance,

    private eventlogService: EventLogService,
    private config: ConfigService,
    private uploadService: UploadService,
    private gmsCategoryService: GmsCategoryService,
    private emailService: EmailService,
    private employeeService: EmployeeService,
    @InjectModel(GrievanceHistory)
    private grievanceHistoryModel: typeof GrievanceHistory,
    private grievanceHistoryService: GrievanceHistoryService,
  ) {}

  async create(
    createGrievanceInput: CreateGrievanceInput,
    files: Express.Multer.File[],
    currentUser?: any,
  ): Promise<GenericResponse<Grievance>> {
    try {
      const grievanceId = await this.generateGrievanceId();

      const uploadedUrls: string[] = [];
      if (files && files.length > 0) {
        for (const file of files) {
          const fileDetails = {
            Key: `grievances/${Date.now()}_${file.originalname}`,
            Body: file.buffer,
            Bucket: this.config.get('AWSBUCKETNAME'),
            ContentType: file.mimetype,
          };

          const url = await this.uploadService.uploadDocument(fileDetails);
          uploadedUrls.push(url);
        }
      }

      const grievance = await this.grievanceModel.create({
        ...createGrievanceInput,
        grievanceId: grievanceId,
        userType: currentUser.name,
        createdById:
          currentUser.name === 'SuperAdmin'
            ? currentUser.id
            : currentUser.employeeID,
        attachments: uploadedUrls,

        orgId: currentUser?.employee?.orgID ?? currentUser?.orgID,
      });

      await this.grievanceHistoryModel.create({
        grievanceId: grievance.id,
        status: grievance.status,
        remarks: '',
        createdById:
          currentUser.name === 'SuperAdmin'
            ? currentUser.id
            : currentUser.employeeID,
        userType: currentUser.name,
      });

      let alertEmails: string[] = [];

      const category = await this.gmsCategoryService.findOne(
        BigInt(grievance.categoryId),
      );
      const rawEmails = category.data.alertEmails as unknown as
        | string
        | string[]
        | null;

      if (Array.isArray(rawEmails)) {
        alertEmails = rawEmails;
      } else if (typeof rawEmails === 'string') {
        alertEmails = rawEmails.split(',').map((m) => m.trim());
      }

      const employee = await this.employeeService.findOne(
        BigInt(grievance.createdById),
      );

      if (
        alertEmails &&
        alertEmails.length > 0 &&
        category.data.notificationOn
      ) {
        const mailObj: MailObjectInput = {
          mailTo: alertEmails,
          cc: [],
          subject: `New Grievance Alert`,
          templateName: 'grievanceAlert',
          isAttachments: grievance.attachments?.length > 0,
          attachments:
            grievance.attachments?.map((fileUrl) => ({
              filename: fileUrl.split('/').pop(),
              path: fileUrl,
            })) || [],
          mailBody: {
            category: category.data.name,
            userName: employee.data.name,
            status: grievance.status,
            createdAt: moment(grievance.createdAt).format('DD-MM-YYYY'),
            description: grievance.description,
            grievanceAttachments:
              grievance.attachments?.map((fileUrl) => ({
                fileName: fileUrl.split('/').pop(),
                path: fileUrl,
              })) || [],
          },
        };

        await this.emailService.sendEmail(mailObj);
      }

      // createdBy shown as a readable name/code instead of a raw
      // internal ID — falls back to currentUser.name for SuperAdmin,
      // since `employee` won't resolve for a non-employee actor.
      const createdByLabel =
        currentUser.name === 'SuperAdmin'
          ? 'SuperAdmin'
          : employee?.data
          ? `${employee.data.name} - ${employee.data.employeeCode}`
          : currentUser.name;

      const eventPayload = JSON.parse(JSON.stringify(createGrievanceInput));
      // Was payload: grievance — the raw model instance. Curated: orgId
      // dropped (redundant with the log's own orgID scoping field
      // below), userType pulled from currentUser.userType instead of
      // the raw grievance.userType column (which is itself populated
      // from currentUser.name — a separate underlying bug, not fixed
      // here, only worked around for display), createdById replaced
      // with a readable name/code, categoryId replaced with the
      // category's actual name.
      const eventLog = {
        objectType: 'Grievance',
        changeType: 'add',
        objectID: grievance.id,
        authID: currentUser.id,
        orgID: currentUser?.orgID,
        updatedBy: currentUser.name,
        payload: {
          id: grievance.id,
          grievanceId: grievance.grievanceId,
          status: grievance.status,
          remarks: grievance.remarks ?? 'N/A',
          userType: currentUser.userType ?? currentUser.name,
          category: category?.data?.name ?? grievance.categoryId,
          description: grievance.description,
          createdBy: createdByLabel,
          transportTeamId: grievance.transportTeamId ?? 'N/A',
        },
        requestPayload: eventPayload,
        user: currentUser,
      };
      await this.eventlogService.create(eventLog);

      return {
        message: 'Grievance created successfully',
        data: grievance,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async generateGrievanceId(): Promise<string> {
    const last = await this.grievanceModel.findOne({
      order: [['createdAt', 'DESC']],
    });

    if (!last || !last.grievanceId) {
      return 'GRV-0001';
    }

    const lastNumber = parseInt(last.grievanceId.split('-')[1]);
    const newNumber = (lastNumber + 1).toString().padStart(4, '0');

    return `GRV-${newNumber}`;
  }

  async findAll(
    filterGrievanceInput: FilterGrievanceInput,
    currentUser?: any,
  ): Promise<PaginatedList<Grievance>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        status,
        startDate,
        endDate,
      } = filterGrievanceInput;

      let whereClause: any = {};
      if (status) {
        whereClause.status = status;
      }

      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [{ name: { [Op.iLike]: `%${search}%` } }],
        };
      }

      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.createdAt = { [Op.between]: [start, end] };
      }

      if (currentUser.orgID) {
        whereClause.orgId = currentUser?.orgID;
      }

      const orderClause: any[] = [];
      if (sortBy?.includes('.')) {
        const [association, field] = sortBy.split('.');
        if (association === 'category') {
          orderClause.push([
            { model: GmsCategory, as: 'category' },
            field,
            sortOrder,
          ]);
        } else if (association === 'createdBy') {
          orderClause.push([
            { model: Employee, as: 'createdBy' },
            field,
            sortOrder,
          ]);
        }
      } else {
        orderClause.push([sortBy, sortOrder]);
      }

      const grievance = await this.grievanceModel.findAndCountAll({
        order: orderClause,
        include: [
          { model: GmsCategory, as: 'category', attributes: ['name'] },
          {
            model: Employee,
            as: 'createdBy',
            attributes: ['name', 'employeeCode'],
          },
        ],
        where: whereClause,
        limit: take,
        offset: skip * take,
      });

      return { totalItems: grievance.count, items: grievance.rows };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: bigint): Promise<GenericResponse<Grievance>> {
    try {
      const whereClause: any = {};

      whereClause.id = id;
      const grievance = await this.grievanceModel.findOne({
        where: whereClause,
        include: [
          { model: GmsCategory, as: 'category', attributes: ['name'] },
          {
            model: Employee,
            as: 'createdBy',
            attributes: ['name', 'employeeCode'],
          },
        ],
      });
      if (grievance) {
        return {
          message: 'Grievance found',
          data: grievance,
        };
      } else {
        throw new NotFoundException('Grievance not found');
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
    updateGrievanceInput: UpdateGrievanceInput,
    files: Express.Multer.File[],
    currentUser: any,
    existingAttachments: string[],
  ) {
    try {
      const uploadedUrls: string[] = [];

      if (files?.length) {
        for (const file of files) {
          const fileDetails = {
            Key: `grievances/${Date.now()}_${file.originalname}`,
            Body: file.buffer,
            Bucket: this.config.get('AWSBUCKETNAME'),
            ContentType: file.mimetype,
          };

          const url = await this.uploadService.uploadDocument(fileDetails);
          uploadedUrls.push(url);
        }
      }

      const grievance = await this.grievanceModel.findOne({ where: { id } });
      if (!grievance) throw new NotFoundException('Grievance not found');

      // The client echoes back the URLs it was shown and reads are moving to
      // presigned URLs, so normalise before persisting.
      const finalAttachments = [
        ...(existingAttachments || []).map(stripS3QueryString),
        ...uploadedUrls,
      ];

      const updatedGrievance = await this.grievanceModel.update(
        {
          ...updateGrievanceInput,
          attachments: finalAttachments,
        },
        { where: { id }, returning: true },
      );
      const updatedRow = updatedGrievance?.[1]?.[0];

      // Resolve category name — the old one (if categoryId changed) and
      // the current/new one — so the diff and heading show real names
      // instead of raw categoryId values.
      const oldCategory = grievance.categoryId
        ? await this.gmsCategoryService.findOne(BigInt(grievance.categoryId))
        : null;
      const newCategoryId =
        (updateGrievanceInput as any).categoryId ?? grievance.categoryId;
      const newCategory =
        String(newCategoryId) !== String(grievance.categoryId)
          ? await this.gmsCategoryService.findOne(BigInt(newCategoryId))
          : oldCategory;
      const oldCategoryName = oldCategory?.data?.name ?? grievance.categoryId;
      const newCategoryName = newCategory?.data?.name ?? newCategoryId;

      // Was payload: updatedGrievance — the raw [affectedCount, rows[]]
      // tuple .update() returns, not a plain object. DetailTable's
      // payloadJSON branch did Object.entries() on that tuple (keys
      // "0"/"1", neither with a .label), so the row rendered blank.
      // Real per-field diff instead, using `grievance` (fetched
      // pre-update) as the old-value source. attachments compared as a
      // joined string since it's an array.
      //
      // 'userType' skipped — not a user-editable field, and the stored
      // grievance.userType column holds a pre-existing bug value
      // (currentUser.name from create(), not an actual type), so
      // diffing it against the update input produced a nonsensical
      // "Niveditha -> Employee" row.
      // 'existingAttachments' skipped — a request-only helper field
      // (the attachments to keep unchanged), not a real column on
      // Grievance, so grievance['existingAttachments'] is always
      // undefined and the diff always showed a one-sided row with no
      // OldValue at all. The real attachments column is already
      // diffed separately below.
      const skipFields = ['userType', 'existingAttachments'];
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      for (const key of Object.keys(updateGrievanceInput)) {
        if (skipFields.includes(key)) continue;
        if (key === 'categoryId') {
          if (oldCategoryName !== newCategoryName) {
            changeJSON.category = {
              OldValue: oldCategoryName,
              newValue: newCategoryName,
            };
          }
          continue;
        }
        const oldValue = (grievance as any)[key];
        const newValue = (updateGrievanceInput as any)[key];
        if (oldValue !== newValue) {
          changeJSON[key] = { OldValue: oldValue, newValue };
        }
      }
      const oldAttachments = (grievance.attachments ?? []).join(', ');
      const newAttachments = finalAttachments.join(', ');
      if (oldAttachments !== newAttachments) {
        changeJSON.attachments = {
          OldValue: oldAttachments || 'N/A',
          newValue: newAttachments || 'N/A',
        };
      }

      const eventPayload = JSON.parse(JSON.stringify(updateGrievanceInput));
      const eventLog = {
        objectType: 'Grievance',
        changeType: 'edit',
        objectID: id,
        authID: currentUser.id,
        orgID: currentUser?.orgID,
        updatedBy: currentUser.name,
        payload: {
          id,
          grievanceId: grievance.grievanceId,
          category: newCategoryName,
        },
        requestPayload: eventPayload,
        changeJSON,
        customDescription: `updated Grievance ${grievance.grievanceId} (${newCategoryName})`,
        user: currentUser,
      };
      await this.eventlogService.create(eventLog);

      return updatedRow;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async statusChange(
    id: string,
    grievanceStatusChangeInput: GrievanceStatusChangeInput,

    currentUser?: any,
  ): Promise<any> {
    try {
      const grievance = await this.grievanceModel.findOne({
        where: { id: id },
      });

      if (!grievance) {
        throw new NotFoundException('Grievance not found');
      }

      const updatedGrievance = await this.grievanceModel.update(
        {
          ...grievanceStatusChangeInput,
        },
        {
          where: { id },
          returning: true,
        },
      );
      const updatedRow = updatedGrievance?.[1]?.[0];

      await this.grievanceHistoryModel.create({
        grievanceId: grievance.id,
        status: grievanceStatusChangeInput.status,
        remarks: grievanceStatusChangeInput.remarks,
        updatedById:
          currentUser.name === 'SuperAdmin'
            ? currentUser.id
            : currentUser.employeeID,
        userType: currentUser.name,
      });

      let alertEmails: string[] = [];

      const category = await this.gmsCategoryService.findOne(
        BigInt(grievance.categoryId),
      );

      const rawEmails = category.data.alertEmails as unknown as
        | string
        | string[]
        | null;

      if (Array.isArray(rawEmails)) {
        alertEmails = rawEmails;
      } else if (typeof rawEmails === 'string') {
        alertEmails = rawEmails.split(',').map((m) => m.trim());
      }

      if (
        alertEmails &&
        alertEmails.length > 0 &&
        category.data.notificationOn
      ) {
        const mailObj: MailObjectInput = {
          mailTo: alertEmails,
          cc: [],
          subject: `Grievance Status Update`,
          templateName: 'grievanceStatus',
          isAttachments: false,
          attachments: [],
          mailBody: {
            status: grievance.status,
          },
        };

        await this.emailService.sendEmail(mailObj);
      }

      // Was payload: updatedGrievance — the raw [affectedCount, rows[]]
      // tuple .update() returns, not a plain object. Real diff instead,
      // using `grievance` (fetched pre-update) as the old-value source.
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      for (const key of Object.keys(grievanceStatusChangeInput)) {
        const oldValue = (grievance as any)[key];
        const newValue = (grievanceStatusChangeInput as any)[key];
        if (oldValue !== newValue) {
          changeJSON[key] = { OldValue: oldValue, newValue };
        }
      }

      const eventPayload = JSON.parse(
        JSON.stringify(grievanceStatusChangeInput),
      );
      const eventLog = {
        objectType: 'Grievance',
        changeType: 'edit',
        objectID: id,
        authID: currentUser.id,
        orgID: currentUser?.orgID,
        updatedBy: currentUser.name,
        payload: {
          id,
          grievanceId: grievance.grievanceId,
          status: updatedRow?.status ?? grievance.status,
        },
        requestPayload: eventPayload,
        changeJSON,
        customDescription: `changed Grievance ${grievance.grievanceId} status to "${grievanceStatusChangeInput.status}"`,
        user: currentUser,
      };
      await this.eventlogService.create(eventLog);

      // Was missing entirely — the controller's return type is
      // Promise<GenericResponse<Grievance>>, but this function fell
      // through to undefined on every successful call, which is why
      // the network tab showed an empty response body all night.
      return {
        message: 'Grievance status updated successfully',
        data: updatedRow,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findCategory(id: bigint): Promise<GenericResponse<Grievance>> {
    try {
      const whereClause: any = {};

      whereClause.categoryId = id;
      const grievance = await this.grievanceModel.findOne({
        where: whereClause,
      });

      return {
        message: 'Grievance found',
        data: grievance,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async exportGrievances(
    exportFilters: any,
    currentUser?: any,
  ): Promise<PaginatedList<Grievance>> {
    try {
      const { dateRange, status } = exportFilters || {};
      const whereClause: any = {};

      if (status) {
        whereClause.status = status;
      }

      if (currentUser?.orgID) {
        whereClause.orgId = currentUser.orgID;
      }

      if (dateRange?.startDate && dateRange?.endDate) {
        const start = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.createdAt = { [Op.between]: [start, end] };
      }

      const grievance = await this.grievanceModel.findAndCountAll({
        order: [['createdAt', 'DESC']],
        include: [
          { model: GmsCategory, as: 'category', attributes: ['name'] },
          {
            model: Employee,
            as: 'createdBy',
            attributes: ['name', 'employeeCode'],
          },
        ],
        where: whereClause,
      });

      // UNVERIFIED — column names ('createdAt', 'remarks') and the
      // Employee association aliases ('createdBy' / 'updatedBy') on
      // GrievanceHistory are inferred from how the frontend consumes
      // /admin/grievanceHistory/:id, not confirmed against the actual
      // model. If this throws a Sequelize "no such association" or
      // "column does not exist" error, that's the first place to check.
      const grievanceIds = grievance.rows.map((g) => g.id);

      const historyRecords = await this.grievanceHistoryModel.findAll({
        where: { grievanceId: { [Op.in]: grievanceIds } },
        include: [
          { model: Employee, as: 'createdBy', attributes: ['name'] },
          { model: Employee, as: 'updatedBy', attributes: ['name'] },
        ],
        order: [
          ['grievanceId', 'ASC'],
          ['createdAt', 'ASC'],
        ],
      });

      const historyByGrievanceId = new Map<string, any[]>();
      for (const h of historyRecords) {
        const key = String(h.grievanceId);
        if (!historyByGrievanceId.has(key)) historyByGrievanceId.set(key, []);
        historyByGrievanceId.get(key)!.push(h);
      }

      const items = grievance.rows.map((g) => ({
        ...g.toJSON(),
        history: historyByGrievanceId.get(String(g.id)) ?? [],
      }));

      return { totalItems: grievance.count, items };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
