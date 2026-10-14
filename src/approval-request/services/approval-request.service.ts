import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { ApprovalStatus, SortOrder } from 'src/shared/enums';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { ApprovalRequest } from '../models/approval-request.model';
import { ApprovalRequestFilterInput } from '../dtos/approvalRequest-filter-input.dto';
import { Employee } from 'src/employee/models/employee.model';
import { UpdateApprovalInput } from '../dtos/update-approval-request-input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Sequelize } from 'sequelize-typescript';
import { Profile } from 'src/profile/model/profile.model';
import { Authentication } from 'src/auth/models/authentication.model';
import { EmailService } from 'src/email/email.service';
import { Cab } from 'src/cabs/models/cab.model';
import { Driver } from 'src/drivers/models/driver.model';
import { CabOrgRequest } from '../models/cab-org-approval-req.model';
import { CabOrgRequestDocumentUpload } from '../models/cab-org-req-document-upload.model';
import { CabDocumentUpload } from 'src/cabs/models/cabDocumentUpload.model';
import { DriverDocumentUpload } from 'src/drivers/models/driverDocumentUpload.model';
import { OrgDriverRequest } from '../models/driver-org-approval-req.model';
import { DriverOrgRequestDocumentUpload } from '../models/driver-org-req-document-upload.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';

@Injectable()
export class ApprovalRequestService {
  private logger = new Logger(ApprovalRequestService.name);

  constructor(
    @InjectModel(ApprovalRequest)
    private approvalRequestModel: typeof ApprovalRequest,
    @InjectModel(Profile)
    private profileModel: typeof Profile,
    @InjectModel(Authentication)
    private authModel: typeof Authentication,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(Cab)
    private cabModel: typeof Cab,
    @InjectModel(Driver)
    private driverModel: typeof Driver,
    @InjectModel(CabOrgRequest)
    private cabOrgRequestModel: typeof CabOrgRequest,
    @InjectModel(OrgDriverRequest)
    private driverOrgRequestModel: typeof OrgDriverRequest,
    @InjectModel(DriverOrgRequestDocumentUpload)
    private driverOrgRequestDocumentUploadModel: typeof DriverOrgRequestDocumentUpload,
    @InjectModel(CabOrgRequestDocumentUpload)
    private cabOrgRequestDocumentUploadModel: typeof CabOrgRequestDocumentUpload,
    private eventlogService: EventLogService,
    private readonly sequelize: Sequelize,
    private emailService: EmailService,
  ) {}

  private resolveApprovalIdentity(approval: any): {
    objectType: string;
    identifier: string;
  } {
    if (approval.employeeID) {
      return {
        objectType: 'Employee Approval Request',
        identifier:
          approval.employee?.name ?? `Employee ${approval.employeeID}`,
      };
    }
    if (approval.cabID) {
      return {
        objectType: 'Cab Approval Request',
        identifier: approval.cab?.regNo ?? `Cab ${approval.cabID}`,
      };
    }
    if (approval.driverID) {
      const driverName = approval.driver?.name;
      const driverCode = approval.driver?.code;
      return {
        objectType: 'Driver Approval Request',
        identifier:
          driverName && driverCode
            ? `${driverName} (${driverCode})`
            : driverName ?? `Driver ${approval.driverID}`,
      };
    }
    return {
      objectType: 'Approval Request',
      identifier: `Request ${approval.id}`,
    };
  }

  private formatDocumentList(docs: any[] | undefined): string {
    if (!Array.isArray(docs) || docs.length === 0) return 'N/A';
    return docs
      .map((doc) => {
        const fileName = doc?.url ? doc.url.split('/').pop() : null;
        return fileName ? `${doc.title}: ${fileName}` : doc?.title ?? 'N/A';
      })
      .join(', ');
  }

  // Detects a bare YYYY-MM-DD date string (no time component) and
  // reformats it to DD/MM/YYYY. Deliberately narrow — only matches
  // strings that already look like a date-only value, so it can't
  // mistake something like a status string or a code for a date.
  private formatDateOnlyIfDate(value: any): any {
    if (typeof value !== 'string') return value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  // Diffs oldRecord vs newRecord (the actual before/after of what was
  // submitted for approval) plus the status transition itself.
  private buildApprovalChangeJSON(
    approval: any,
    newStatus: string,
  ): Record<string, { OldValue: any; newValue: any }> {
    const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
    const oldRecord = (approval.oldRecord as Record<string, any>) || {};
    const newRecord = (approval.newRecord as Record<string, any>) || {};
    const keys = new Set([
      ...Object.keys(oldRecord),
      ...Object.keys(newRecord),
    ]);
    for (const key of keys) {
      if (key === 'documents') {
        const oldDocs = this.formatDocumentList(oldRecord.documents);
        const newDocs = this.formatDocumentList(newRecord.documents);
        if (oldDocs !== newDocs) {
          changeJSON['Documents'] = { OldValue: oldDocs, newValue: newDocs };
        }
        continue;
      }
      const oldValue = oldRecord[key];
      const newValue = newRecord[key];
      if (oldValue !== newValue) {
        changeJSON[key] = {
          OldValue: this.formatDateOnlyIfDate(oldValue) ?? null,
          newValue: this.formatDateOnlyIfDate(newValue) ?? null,
        };
      }
    }
    changeJSON['status'] = { OldValue: approval.status, newValue: newStatus };
    return changeJSON;
  }

  async updateEmployeeApprovalStatus(
    input: UpdateApprovalInput,
    user: any,
  ): Promise<GenericResponse<ApprovalRequest[]>> {
    const transaction = await this.sequelize.transaction();

    try {
      const { status, ids } = input;
      const updateStatus =
        status === 'Approve'
          ? ApprovalStatus.Approved
          : status === 'Reject'
          ? ApprovalStatus.Rejected
          : status;

      const approvalRequests = await this.approvalRequestModel.findAll({
        where: { id: ids, orgID: user.orgID },
        transaction,
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'name', 'email'],
          },
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo'],
            required: false,
          },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code'],
            required: false,
          },
        ],
      });

      if (!approvalRequests.length) {
        return {
          message: 'No valid approval requests found',
          data: [],
          status: false,
        };
      }

      if (updateStatus === ApprovalStatus.Approved) {
        for (const approval of approvalRequests) {
          if (approval.requestedBy !== 'Employee') continue;

          const { employeeID, newRecord } = approval;
          await this.profileModel.update(newRecord, {
            where: { employeeID },
            transaction,
          });
          const employeeUpdateData: any = {};
          [
            'name',
            'email',
            'phone',
            'gender',
            'dob',
            'landmark',
            'address',
            'homePoint',
            'bloodGroup',
            'emergencyContactNo',
            'emergencyContactName',
          ].forEach((key) => {
            if (newRecord[key] !== undefined) {
              employeeUpdateData[key] = newRecord[key];
            }
          });
          if (Object.keys(employeeUpdateData).length) {
            const employeeValidationErrors = await uniqueFieldsCheck(
              this.employeeModel,
              ['email', 'phone'],
              employeeUpdateData,
              employeeID.toString(),
              user.orgID,
            );
            handleErrors(employeeValidationErrors, 'unique');

            await this.employeeModel.update(employeeUpdateData, {
              where: { id: employeeID },
              transaction,
            });
          }
          const authUpdateData: any = {};
          ['name', 'email', 'phone'].forEach((key) => {
            if (newRecord[key] !== undefined) {
              authUpdateData[key] = newRecord[key];
            }
          });

          if (Object.keys(authUpdateData).length) {
            const authValidationErrors = await uniqueFieldsCheck(
              this.authModel,
              ['email', 'phone'],
              authUpdateData,
              user.id,
              null,
            );
            handleErrors(authValidationErrors, 'unique');

            await this.authModel.update(authUpdateData, {
              where: { employeeID },
              transaction,
            });
          }
        }
      }
      await this.approvalRequestModel.update(
        {
          status: updateStatus,
          approvedOn:
            updateStatus === ApprovalStatus.Approved ? new Date() : null,
          rejectedOn:
            updateStatus === ApprovalStatus.Rejected ? new Date() : null,
        },
        {
          where: { id: ids },
          transaction,
        },
      );
      const isApproved = updateStatus === ApprovalStatus.Approved;
      const isRejected = updateStatus === ApprovalStatus.Rejected;
      for (const approval of approvalRequests) {
        if (approval?.employeeID) {
          if (!approval.employee?.email) continue;

          if (isApproved || isRejected) {
            await this.emailService.sendEmail({
              mailTo: [approval.employee.email],
              subject: `Profile Update Request ${
                isApproved ? 'Approved' : 'Rejected'
              }`,
              templateName: 'approval-status',
              mailBody: {
                employeeName: approval.employee.name,
                status: isApproved ? 'Approved' : 'Rejected',
                oldRecord: approval.oldRecord,
                newRecord: approval.newRecord,
              },
              isAttachments: false,
              attachments: [],
            });
          }
        } else if (approval?.cabID) {
          if (isApproved) await this.approveCab(approval, transaction);
          else await this.rejectCab(approval, transaction);
        } else if (approval.driverID) {
          if (isApproved) await this.approveDriver(approval, transaction);
          else await this.rejectDriver(approval, transaction);
        }
      }
      const eventLogs = approvalRequests.map((req) => {
        const { objectType, identifier } = this.resolveApprovalIdentity(req);
        // status still reflects the PRE-update value here — this array
        // was fetched before the bulk approvalRequestModel.update() call
        // above, and a static (class-level) .update() doesn't mutate
        // already-loaded instances, so req.status is safely the "old"
        // value for the diff below.
        const changeJSON = this.buildApprovalChangeJSON(req, updateStatus);
        const requestType = objectType.replace(' Approval Request', '');

        return {
          objectType,
          changeType: 'edit',
          objectID: req.id,
          authID: user.id,
          orgID: user.orgID,
          updatedBy: user.name,
          payload: {
            approvalRequestID: req.id,
            requestType,
            identifier,
            previousStatus: req.status,
            newStatus: updateStatus,
          },
          requestPayload: { status },
          changeJSON,
          customDescription: `${updateStatus.toLowerCase()} ${objectType} for ${identifier}`,
          user,
        };
      });

      if (eventLogs.length) {
        await this.eventlogService.bulkCreate(eventLogs);
      }

      await transaction.commit();

      return {
        message: `Approvals ${updateStatus.toLowerCase()} successfully`,
        data: approvalRequests,
        status: true,
      };
    } catch (error: any) {
      await transaction.rollback();
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async findAll(
  //   approvalRequestFilterInput: ApprovalRequestFilterInput,
  //   user: any,
  // ): Promise<PaginatedList<ApprovalRequest>> {
  //   try {
  //     const {
  //       take = 25,
  //       skip = 0,
  //       sortBy = 'id',
  //       sortOrder = SortOrder.DESC,
  //       status,
  //     } = approvalRequestFilterInput;
  //     const whereClause: any = {
  //       orgID: user.orgID,
  //     };
  //     if (status) {
  //       whereClause.status = status;
  //     }

  //     let orderClause: any = [[sortBy, sortOrder]];
  //     if (sortBy === 'employee.name') {
  //       orderClause = [
  //         [{ model: Employee, as: 'employee' }, 'name', sortOrder],
  //       ];
  //     }
  //     if (sortBy === 'employee.employeeCode') {
  //       orderClause = [
  //         [{ model: Employee, as: 'employee' }, 'employeeCode', sortOrder],
  //       ];
  //     }
  //     const approvalRequest = await this.approvalRequestModel.findAndCountAll({
  //       distinct: true,
  //       order: orderClause,
  //       limit: take,
  //       offset: skip * take,
  //       where: whereClause,
  //       include: [
  //         {
  //           model: Employee,
  //           as: 'employee',
  //           attributes: ['id', 'name', 'employeeCode'],
  //         },
  //         {
  //           model: Cab,
  //           as: 'cab',
  //           attributes: ['id', 'regNo'],
  //           required: false,
  //           include: [
  //             {
  //               model: CabDocumentUpload,
  //               as: 'documents',
  //             },
  //           ],
  //         },
  //         {
  //           model: Driver,
  //           as: 'driver',
  //           attributes: ['id', 'name', 'code'],
  //           required: false,
  //         },
  //         {
  //           model: CabOrgRequest,
  //           as: 'cabOrgRequest',
  //           required: false,
  //           include: [
  //             {
  //               model: CabOrgRequestDocumentUpload,
  //               as: 'documents',
  //             },
  //           ],
  //         },
  //       ],
  //       // include: [
  //       //   {
  //       //     model: Employee,
  //       //     as: 'employee',
  //       //     attributes: ['id', 'name', 'employeeCode'],
  //       //   },
  //       //   {
  //       //     model: Cab,
  //       //     as: 'cab',
  //       //     attributes: ['id', 'regNo'],
  //       //     required: false,
  //       //   },
  //       //   {
  //       //     model: Driver,
  //       //     as: 'driver',
  //       //     attributes: ['id', 'name', 'code'],
  //       //     required: false,
  //       //   },
  //       // ],
  //     });
  //     const items = approvalRequest.rows.map((row) => {
  //       const item: any = row.toJSON();

  //       if (item.employee) {
  //         item.reference = {
  //           title: item.employee.name,
  //           subtitle: item.employee.employeeCode,
  //         };
  //       } else if (item.cab) {
  //         item.reference = {
  //           title: item.cab.regNo,
  //           subtitle: item.cab.regNo,
  //         };
  //           console.log("item.cabOrgRequest:",item.cabOrgRequest);

  //         // Override ApprovalRequest JSON
  //         if (item.cabOrgRequest) {
  //           item.reference = {
  //             title: item.cabOrgRequest.regNo,
  //             subtitle: item.cabOrgRequest.regNo,
  //           };
  //           const mergedOldRecord = {
  //             ...(item.oldRecord || {}),
  //           };
  //           console.log("mergedOldRecord:",mergedOldRecord);
  //           Object.keys(item.cabOrgRequest.toJSON()).forEach((key) => {
  //             const value = item.cabOrgRequest[key];
  //             // Ignore metadata columns
  //             if (
  //               [
  //                 'id',
  //                 'cabID',
  //                 'orgID',
  //                 'vendorID',
  //                 'status',
  //                 'createdAt',
  //                 'updatedAt',
  //                 'deletedAt',
  //                 'documents',
  //               ].includes(key)
  //             ) {
  //               return;
  //             }
  //             // Override only if CabOrgRequest has a value
  //             if (value !== null && value !== undefined) {
  //               mergedOldRecord[key] = value;
  //                           console.log("mergedOldRecord[key]:",mergedOldRecord[key]);

  //             }
  //           });
  //           // Documents
  //           if (item.cabOrgRequest.documents?.length) {
  //             mergedOldRecord.documents = item.cabOrgRequest.documents;
  //           }
  //           item.oldRecord = mergedOldRecord; item.newRecord = this.buildCabRecord(item.cabOrgRequest);
  //         }
  //       } else if (item.driver) {
  //         item.reference = {
  //           title: item.driver.name,
  //           subtitle: item.driver.code,
  //         };
  //       } else {
  //         item.reference = {
  //           title: '-',
  //           subtitle: '-',
  //         };
  //       }

  //       return item;
  //     });

  //     // const items = approvalRequest.rows.map((row) => {
  //     //   const item = row.toJSON();

  //     //   if (item.employee) {
  //     //     item.reference = {
  //     //       title: item.employee.name,
  //     //       subtitle: item.employee.employeeCode,
  //     //     };
  //     //   } else if (item.cab) {
  //     //     item.reference = {
  //     //       title: item.cab.regNo,
  //     //       subtitle: item.cab.regNo, // or vendorCode/model if you prefer
  //     //     };
  //     //   } else if (item.driver) {
  //     //     item.reference = {
  //     //       title: item.driver.name,
  //     //       subtitle: item.driver.code,
  //     //     };
  //     //   } else {
  //     //     item.reference = {
  //     //       title: '-',
  //     //       subtitle: '-',
  //     //     };
  //     //   }

  //     //   return item;
  //     // });

  //     return {
  //       totalItems: approvalRequest.count,
  //       items,
  //     };
  //   } catch (error: any) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }
  async findAll(
    approvalRequestFilterInput: ApprovalRequestFilterInput,
    user: any,
  ): Promise<PaginatedList<ApprovalRequest>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        status,
      } = approvalRequestFilterInput;
      const whereClause: any = {
        orgID: user.orgID,
      };
      if (status) {
        whereClause.status = status;
      }

      let orderClause: any = [[sortBy, sortOrder]];
      if (sortBy === 'employee.name') {
        orderClause = [
          [{ model: Employee, as: 'employee' }, 'name', sortOrder],
        ];
      }
      if (sortBy === 'employee.employeeCode') {
        orderClause = [
          [{ model: Employee, as: 'employee' }, 'employeeCode', sortOrder],
        ];
      }
      // else if (
      //   !["requestType", "reference.title", "reference.subtitle"].includes(sortBy)
      // ) {
      //   orderClause = [[sortBy, sortOrder]];
      // }
      if (
        ['requestType', 'reference.title', 'reference.subtitle'].includes(
          sortBy,
        )
      ) {
        orderClause = [['id', sortOrder]];
      }
      const approvalRequest = await this.approvalRequestModel.findAndCountAll({
        distinct: true,
        order: orderClause,
        limit: take,
        offset: skip * take,
        where: whereClause,
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'name', 'employeeCode'],
          },
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo'],
            required: false,
            include: [
              {
                model: CabDocumentUpload,
                as: 'documents',
              },
            ],
          },
          {
            model: Driver,
            as: 'driver',
            attributes: ['id', 'name', 'code'],
            required: false,
            include: [
              {
                model: DriverDocumentUpload,
                as: 'documents',
              },
            ],
          },
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
      });
      const items = await Promise.all(
        approvalRequest.rows.map(async (row) => {
          const item: any = row.toJSON();

          // Employee Request
          if (item.employeeID) {
            item.requestType = 'Employee';
            item.reference = {
              title: item.employee?.name ?? '-',
              subtitle: item.employee?.employeeCode ?? '-',
            };
            item.requestedByName = 'Employee';
            return item;
          }

          // Cab Request
          if (item.cabID) {
            item.requestType = 'Cab';
            item.reference = {
              title: 'N/A',
              subtitle: item.cab?.regNo ?? '-',
            };
            item.requestedByName = item.vendor?.name ?? '-';
            return item;
          }

          // Driver Request
          if (item.driverID) {
            item.requestType = 'Driver';
            item.reference = {
              title: item.driver?.name ?? '-',
              subtitle:
                item.driver?.code && item.driver.code.trim()
                  ? item.driver.code
                  : 'N/A',
            };
            item.requestedByName = item.vendor?.name ?? '-';
            return item;
          }

          return item;
        }),
      );

      return {
        totalItems: approvalRequest.count,
        items,
        // items: approvalRequest.rows,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(
    id: string,
    user: any,
  ): Promise<GenericResponse<ApprovalRequest>> {
    try {
      const approvalRequest = await this.approvalRequestModel.findOne({
        where: { id, orgID: user.orgID },
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'name', 'employeeCode'],
          },
        ],
      });
      if (approvalRequest)
        return {
          message: 'Approval request found',
          data: approvalRequest,
        };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  private async approveCab(approval: ApprovalRequest, transaction: any) {
    const { cabID, orgID, vendorID, newRecord } = approval;

    // Separate documents from other cab fields
    const cabNewRecord = newRecord as Record<string, any>;
    const { documents = [], ...cabData } = cabNewRecord;
    // Update/Create organization-specific cab record
    const cabOrgRequest = await this.cabOrgRequestModel.findOne({
      where: {
        cabID,
        orgID,
      },
      transaction,
    });

    if (cabOrgRequest) {
      await cabOrgRequest.update(cabData, { transaction });
    } else {
      this.logger.log('Request not found');
    }

    // Update only changed documents
    if (documents.length > 0) {
      for (const doc of documents) {
        const existingDoc = await this.cabOrgRequestDocumentUploadModel.findOne(
          {
            where: {
              cabOrgRequestID: cabOrgRequest.id,
              title: doc.title,
            },
            transaction,
          },
        );

        if (existingDoc) {
          await existingDoc.update(
            {
              url: doc.url,
            },
            { transaction },
          );
        } else {
          await this.cabOrgRequestDocumentUploadModel.create(
            {
              cabOrgRequestID: cabOrgRequest.id,
              cabID,
              orgID,
              vendorID,
              title: doc.title,
              url: doc.url,
            },
            { transaction },
          );
        }
      }
    }
  }
  private async approveDriver(approval: ApprovalRequest, transaction: any) {
    const { driverID, orgID, vendorID, newRecord } = approval;

    // Separate documents from other driver fields
    const driverNewRecord = newRecord as Record<string, any>;
    const { documents = [], ...driverData } = driverNewRecord;

    // Find organization-specific driver request
    const driverOrgRequest = await this.driverOrgRequestModel.findOne({
      where: {
        driverID,
        orgID,
      },
      transaction,
    });

    if (driverOrgRequest) {
      // Update existing organization-specific driver record
      await driverOrgRequest.update(driverData, { transaction });
    } else {
      this.logger.log('Driver org request not found');
      return;
    }

    // Update/Create only changed documents
    if (documents.length > 0) {
      for (const doc of documents) {
        const existingDoc =
          await this.driverOrgRequestDocumentUploadModel.findOne({
            where: {
              driverOrgRequestID: driverOrgRequest.id,
              title: doc.title,
            },
            transaction,
          });

        if (existingDoc) {
          // Update existing document
          await existingDoc.update(
            {
              url: doc.url,
            },
            { transaction },
          );
        } else {
          // Create new document
          await this.driverOrgRequestDocumentUploadModel.create(
            {
              driverOrgRequestID: driverOrgRequest.id,
              driverID,
              orgID,
              vendorID,
              title: doc.title,
              url: doc.url,
            },
            { transaction },
          );
        }
      }
    }
  }

  private async rejectCab(approval: ApprovalRequest, transaction: any) {
    const { cabID, orgID, vendorID, oldRecord, newRecord } = approval;

    const vendorData = newRecord as Record<string, any>;
    const orgData = oldRecord as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { documents: _, ...cabData } = vendorData;
    const { documents: oldDocuments = [], ...oldCabData } = orgData;

    // Vendor keeps the latest changes
    await this.cabModel.update(cabData, {
      where: { id: cabID },
      transaction,
    });

    const cabOrgRequest = await this.cabOrgRequestModel.findOne({
      where: {
        cabID,
        orgID,
      },
      transaction,
    });

    if (cabOrgRequest) {
      await cabOrgRequest.update(oldCabData, {
        transaction,
      });
    } else {
      this.logger.log('Request not found');
      // cabOrgRequest = await this.cabOrgRequestModel.create(
      //   {
      //     cabID,
      //     orgID,
      //     ...oldCabData,
      //   },
      //   { transaction },
      // );
    }

    // Restore only previously existing documents
    for (const oldDoc of oldDocuments) {
      if (!oldDoc.url) {
        continue;
      }
      const existingDoc = await this.cabOrgRequestDocumentUploadModel.findOne({
        where: {
          cabOrgRequestID: cabOrgRequest.id,
          title: oldDoc.title,
        },
        transaction,
      });

      if (existingDoc) {
        await existingDoc.update(
          {
            url: oldDoc.url,
          },
          { transaction },
        );
      } else {
        await this.cabOrgRequestDocumentUploadModel.create(
          {
            cabOrgRequestID: cabOrgRequest.id,
            cabID,
            orgID,
            vendorID,
            title: oldDoc.title,
            url: oldDoc.url,
          },
          { transaction },
        );
      }
    }
  }
  private async rejectDriver(approval: ApprovalRequest, transaction: any) {
    const { driverID, orgID, vendorID, oldRecord, newRecord } = approval;

    const vendorData = newRecord as Record<string, any>;
    const orgData = oldRecord as Record<string, any>;

    // Vendor keeps the latest changes
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { documents: _, ...driverData } = vendorData;
    const { documents: oldDocuments = [], ...oldDriverData } = orgData;

    await this.driverModel.update(driverData, {
      where: { id: driverID },
      transaction,
    });

    const driverOrgRequest = await this.driverOrgRequestModel.findOne({
      where: {
        driverID,
        orgID,
      },
      transaction,
    });

    if (driverOrgRequest) {
      await driverOrgRequest.update(oldDriverData, {
        transaction,
      });
    } else {
      this.logger.log('Request not found');
    }

    // Restore only previously existing documents
    for (const oldDoc of oldDocuments) {
      if (!oldDoc.url) {
        continue;
      }

      const existingDoc =
        await this.driverOrgRequestDocumentUploadModel.findOne({
          where: {
            driverOrgRequestID: driverOrgRequest.id,
            title: oldDoc.title,
          },
          transaction,
        });

      if (existingDoc) {
        await existingDoc.update(
          {
            url: oldDoc.url,
          },
          { transaction },
        );
      } else {
        await this.driverOrgRequestDocumentUploadModel.create(
          {
            driverOrgRequestID: driverOrgRequest.id,
            driverID,
            orgID,
            vendorID,
            title: oldDoc.title,
            url: oldDoc.url,
          },
          { transaction },
        );
      }
    }
  }
  private buildCabRecord(cab: any) {
    if (!cab) return {};

    return {
      regNo: cab.regNo,
      rcOwner: cab.rcOwner,
      rcExpiry: cab.rcExpiry,
      color: cab.color,
      noOfSeats: cab.noOfSeats,
      insuranceEndDate: cab.insuranceEndDate,
      pollutionEndDate: cab.pollutionEndDate,
      manufacturingDate: cab.manufacturingDate,
      model: cab.model,
      fuelType: cab.fuelType,
      insuranceNumber: cab.insuranceNumber,
      insuranceProvider: cab.insuranceProvider,
      subVendor: cab.subVendor,
      permitExpiry: cab.permitExpiry,
      fitnessExpiry: cab.fitnessExpiry,
      taxExpiry: cab.taxExpiry,

      documents:
        cab.documents?.map((doc) => ({
          title: doc.title,
          url: doc.url,
        })) ?? [],
    };
  }
}
