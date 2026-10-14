import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Op, Sequelize } from 'sequelize';
import { InjectModel } from 'node_modules/@nestjs/sequelize';
import { OrganizationDriver } from '../models/organizationDriver.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { CreateOrgDriverInput } from '../dtos/create-orgDriver-input.dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { RequestStatus, SortOrder, Status, UserType } from 'src/shared/enums';
import { OrgDriverFilterInput } from '../dtos/orgDriver-filter-input.dto';
import { UpdateOrgDriverInput } from '../dtos/update-orgDriver-input.dto';
import { Driver } from 'src/drivers/models/driver.model';
import { Organization } from 'src/organization/models/organization.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { DriverDocumentUpload } from 'src/drivers/models/driverDocumentUpload.model';
import { OrgDriverRequest } from 'src/approval-request/models/driver-org-approval-req.model';
import { DriverOrgRequestDocumentUpload } from 'src/approval-request/models/driver-org-req-document-upload.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';

@Injectable()
export class OrganizationDriverService {
  constructor(
    @InjectModel(OrganizationDriver)
    private orgDriverModel: typeof OrganizationDriver,
    @InjectModel(OrgDriverRequest)
    private driverOrgRequestModel: typeof OrgDriverRequest,
    @InjectModel(DriverOrgRequestDocumentUpload)
    private driverOrgRequestDocumentUploadModel: typeof DriverOrgRequestDocumentUpload,
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    private eventlogService: EventLogService,
  ) {}

  async assignDrivers(
    createOrgDriverInput: CreateOrgDriverInput,
    user: any,
  ): Promise<GenericResponse<OrganizationDriver>> {
    try {
      const { addedDrivers, removedDrivers } = createOrgDriverInput;
      for (const driverInput of removedDrivers) {
        const existingDriver = await this.orgDriverModel.findOne({
          where: {
            driverID: driverInput.driverID,
            orgID: driverInput.orgID,
            vendorID: user.vendorID,
          },
        });
        if (existingDriver) {
          await this.orgDriverModel.destroy({
            where: {
              driverID: driverInput.driverID,
              orgID: driverInput.orgID,
              vendorID: user.vendorID,
            },
          });
        }
      }
      const uniqueAddedDrivers = [];
      for (const driverInput of addedDrivers) {
        const existingriver = await this.orgDriverModel.findOne({
          where: {
            driverID: driverInput.driverID,
            orgID: driverInput.orgID,
            vendorID: user.vendorID,
          },
        });
        if (!existingriver) {
          uniqueAddedDrivers.push({
            ...driverInput,
            vendorID: user.vendorID,
            status: RequestStatus.Pending,
          });
        } else if (existingriver.status === 'Rejected') {
          await existingriver.update({ status: RequestStatus.Pending });
        }
      }
      const createdDrivers =
        uniqueAddedDrivers.length > 0
          ? await this.orgDriverModel.bulkCreate(uniqueAddedDrivers)
          : [];
      const eventLogs = createdDrivers.map((orgCab) => ({
        objectType: 'OrganizationDriver',
        changeType: 'add',
        objectID: orgCab.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: orgCab,
        requestPayload: orgCab,
      }));

      if (eventLogs.length > 0) {
        await this.eventlogService.bulkCreate(eventLogs);
      }

      return {
        message: 'Drivers assigned successfully',
        data: createdDrivers[0],
      };
    } catch (error) {
      throw error;
    }
  }

  async findAllDriversByOrgID(
    orgDriverFilterInput: OrgDriverFilterInput,
    user: any,
  ): Promise<PaginatedList<OrganizationDriver>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        orgID,
        vendorID,
        status,
        search,
        driverID,
        vendorName, // Add search parameter
      } = orgDriverFilterInput;

      const whereClause: any = {};

      whereClause.orgID = user?.orgID ? user?.orgID : user?.employee?.orgID;

      if (driverID) {
        whereClause.driverID = driverID;
      }
      if (orgID) {
        whereClause.orgID = orgID;
      }
      if (vendorID) {
        whereClause.vendorID = vendorID;
      }
      if (status) {
        whereClause.status = status;
      } else {
        whereClause.status = { [Op.ne]: 'Rejected' };
      }
      const includeClause: any = [
        {
          model: Driver,
          as: 'driver',
          attributes: [
            'id',
            'vendorID',
            'name',
            'code',
            'email',
            'address',
            'phone',
            'dob',
            'image',
            'licenseExpiry',
            'policeClearenceExpiry',
            'medFitExpiry',
            'licenseNo',
            'aadharNumber',
            'status',
          ],
          where: {
            ...(search
              ? {
                  [Op.or]: [
                    { name: { [Op.iLike]: `%${search}%` } },
                    { code: { [Op.iLike]: `%${search}%` } },
                    { email: { [Op.iLike]: `%${search}%` } },
                    { phone: { [Op.iLike]: `%${search}%` } },
                    { licenseNo: { [Op.iLike]: `%${search}%` } },
                  ],
                }
              : {}),
            status: 'Active', // Only active drivers
          },
          include: [
            {
              model: DriverDocumentUpload,
              as: 'documents',
              attributes: ['id', 'title', 'url'],
            },
          ],
        },
        {
          model: Organization,
          as: 'org',
          attributes: ['id', 'name'],
        },
        {
          model: Vendor,
          as: 'vendor',
          attributes: ['name'],
          // where: search
          //   ? {
          //       name: { [Op.iLike]: `%${search}%` },
          //     }
          //   : undefined,
          where: vendorName
            ? { name: { [Op.iLike]: `%${vendorName}%` } }
            : undefined,
          // required: false,
          required: vendorName ? true : false,
        },
      ];

      const orderClause: any[] = [];

      if (sortBy.includes('.')) {
        const [association, field] = sortBy.split('.');
        if (association === 'driver') {
          orderClause.push([{ model: Driver, as: 'driver' }, field, sortOrder]);
        }
      } else {
        orderClause.push([sortBy, sortOrder]);
      }

      const orgDrivers = await this.orgDriverModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: orderClause,
        limit: take,
        offset: skip * take,
        // subQuery: false,
        include: includeClause,
      });

      const items = await Promise.all(
        orgDrivers.rows.map(async (row: any) => {
          const item = row.toJSON();

          const driverOrgRequest = await this.driverOrgRequestModel.findOne({
            where: {
              driverID: item.driverID,
              orgID: item.orgID,
            },
            include: [
              {
                model: DriverOrgRequestDocumentUpload,
                as: 'documents',
              },
            ],
          });

          if (driverOrgRequest) {
            item.driver = {
              ...item.driver,
              ...driverOrgRequest.toJSON(),
              documents: driverOrgRequest.documents,
            };
          }

          return item;
        }),
      );

      return {
        totalItems: orgDrivers.count,
        items,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // ============================================================
  // Replace the entire listDriversByOrg method with this
  // (builds on the version already pasted in — only the exclusion
  // block changed, to also exclude currentTripIDs from the conflict search)
  // ============================================================

  async listDriversByOrg(
    orgDriverFilterInput: OrgDriverFilterInput,
    user: any,
  ): Promise<PaginatedList<OrganizationDriver>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        orgID,
        vendorID,
        status,
        search,
        driverID,
        vendorName,
        date,
        shiftTime,
        pickDrop,
        currentTripIDs,
      } = orgDriverFilterInput;
      const whereClause: any = {};

      whereClause.orgID = user?.orgID ? user?.orgID : user?.employee?.orgID;

      if (driverID) {
        whereClause.driverID = driverID;
      }
      if (orgID) {
        whereClause.orgID = orgID;
      }
      if (vendorID) {
        whereClause.vendorID = vendorID;
      }
      if (status) {
        whereClause.status = status;
      } else {
        whereClause.status = { [Op.ne]: 'Rejected' };
      }

      // Only apply the "not already booked" exclusion when we're not
      // looking up one specific driverID (those two use-cases don't
      // co-occur from any current caller, so this keeps them from
      // clobbering each other).
      if (!driverID && date && shiftTime && pickDrop) {
        // Scoped exclusion: a driver already committed to ANY non-terminal
        // trip in this same date/shift/direction is unavailable — EXCEPT
        // trips that are part of the current edit session (currentTripIDs).
        // That exception is what lets an admin freely reshuffle drivers
        // among a batch of trips they're editing together, while still
        // blocking a genuine conflict with a trip outside that batch.
        const excludeTripIDList = currentTripIDs
          ? currentTripIDs
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
          : [];

        const conflictingTrips = await this.tripModel.findAll({
          attributes: ['driverID'],
          where: {
            status: { [Op.notIn]: ['Cancelled', 'Completed'] },
            driverID: { [Op.ne]: null },
            date,
            shiftTime,
            pickDrop,
            ...(excludeTripIDList.length
              ? { id: { [Op.notIn]: excludeTripIDList } }
              : {}),
          },
          raw: true,
        });
        const conflictingDriverIDs = conflictingTrips
          .map((t: any) => t.driverID)
          .filter(Boolean);
        whereClause.driverID = {
          [Op.notIn]: conflictingDriverIDs.length ? conflictingDriverIDs : [0],
        };
      } else if (!driverID) {
        // Backward-compat fallback for any caller that hasn't been updated
        // yet to send date/shiftTime/pickDrop — keep the old, narrower
        // Ongoing-only exclusion rather than dropping it entirely.
        whereClause[Op.and] = Sequelize.literal(
          `"OrganizationDriver"."driverID" NOT IN (
             SELECT "driverID" FROM "Trips" WHERE "status" = 'Ongoing' AND "driverID" IS NOT NULL
           )`,
        );
      }

      const includeClause: any = [
        {
          model: Driver,
          as: 'driver',
          attributes: [
            'id',
            'vendorID',
            'name',
            'code',
            'email',
            'address',
            'phone',
            'dob',
            'image',
            'licenseExpiry',
            'policeClearenceExpiry',
            'medFitExpiry',
            'licenseNo',
            'aadharNumber',
            'status',
          ],
          where: {
            ...(search
              ? {
                  [Op.or]: [
                    { name: { [Op.iLike]: `%${search}%` } },
                    { code: { [Op.iLike]: `%${search}%` } },
                    { email: { [Op.iLike]: `%${search}%` } },
                    { phone: { [Op.iLike]: `%${search}%` } },
                    { licenseNo: { [Op.iLike]: `%${search}%` } },
                  ],
                }
              : {}),
            status: 'Active', // Only active drivers
          },
          include: [
            {
              model: DriverDocumentUpload,
              as: 'documents',
              attributes: ['id', 'title', 'url'],
            },
          ],
        },
        {
          model: Organization,
          as: 'org',
          attributes: ['id', 'name'],
        },
        {
          model: Vendor,
          as: 'vendor',
          attributes: ['name'],
          where: vendorName
            ? { name: { [Op.iLike]: `%${vendorName}%` } }
            : undefined,
          required: vendorName ? true : false,
        },
      ];

      const orderClause: any[] = [];

      if (sortBy.includes('.')) {
        const [association, field] = sortBy.split('.');
        if (association === 'driver') {
          orderClause.push([{ model: Driver, as: 'driver' }, field, sortOrder]);
        }
      } else {
        orderClause.push([sortBy, sortOrder]);
      }

      const orgDrivers = await this.orgDriverModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: orderClause,
        limit: take,
        offset: skip * take,
        // subQuery: false,
        include: includeClause,
      });

      return {
        totalItems: orgDrivers.count,
        items: orgDrivers.rows,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async listAllDriversByOrgID(
    orgDriverFilterInput: OrgDriverFilterInput,
    user: any,
  ): Promise<PaginatedList<OrganizationDriver>> {
    try {
      const {
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        orgID,
        vendorID,
        status,
        search,
        vendorName, // Add search parameter
      } = orgDriverFilterInput;

      const whereClause: any = {};

      whereClause.orgID = user?.orgID ? user?.orgID : user?.employee?.orgID;

      if (orgID) {
        whereClause.orgID = orgID;
      }
      if (vendorID) {
        whereClause.vendorID = vendorID;
      }
      if (status) {
        whereClause.status = status;
      }

      const includeClause: any = [
        {
          model: Driver,
          as: 'driver',
          attributes: [
            'id',
            'vendorID',
            'name',
            'code',
            'email',
            'address',
            'phone',
            'dob',
            'image',
            'licenseExpiry',
            'policeClearenceExpiry',
            'medFitExpiry',
            'licenseNo',
            'aadharNumber',
            'status',
          ],
          where: {
            ...(search
              ? {
                  [Op.or]: [
                    { name: { [Op.iLike]: `%${search}%` } },
                    { code: { [Op.iLike]: `%${search}%` } },
                    { email: { [Op.iLike]: `%${search}%` } },
                    { phone: { [Op.iLike]: `%${search}%` } },
                    { licenseNo: { [Op.iLike]: `%${search}%` } },
                  ],
                }
              : {}),
            status: 'Active',
          },
          include: [
            {
              model: DriverDocumentUpload,
              as: 'documents',
              attributes: ['id', 'title', 'url'],
            },
          ],
        },
        {
          model: Organization,
          as: 'org',
          attributes: ['id', 'name'],
        },
        {
          model: Vendor,
          as: 'vendor',
          attributes: ['name'],
          // where: search
          //   ? {
          //       name: { [Op.iLike]: `%${search}%` },
          //     }
          //   : undefined,
          where: {
            // ...(search ? { name: { [Op.iLike]: `%${search}%` } } : undefined),
            ...(vendorName ? { name: { [Op.iLike]: `%${vendorName}%` } } : {}),
          },
          // required: false,
          required: vendorName ? true : false,
        },
      ];

      const orderClause: any[] = [];

      if (sortBy.includes('.')) {
        const [association, field] = sortBy.split('.');
        if (association === 'driver') {
          orderClause.push([{ model: Driver, as: 'driver' }, field, sortOrder]);
        }
      } else {
        orderClause.push([sortBy, sortOrder]);
      }

      const orgDrivers = await this.orgDriverModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: orderClause,
        // limit: take,
        // offset: skip * take,
        subQuery: false,
        include: includeClause,
      });

      return {
        totalItems: orgDrivers.count,
        items: orgDrivers.rows,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOneOrgDriver(
    id: string,
    user: any,
  ): Promise<GenericResponse<OrganizationDriver>> {
    try {
      const orgDriver = await this.orgDriverModel.findOne({
        where: {
          id,
          orgID: user.orgID,
        },
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: [
              'id',
              'vendorID',
              'name',
              'code',
              'email',
              'phone',
              'address',
              'dob',
              'aadharNumber',
              'licenseNo',
              'licenseExpiry',
              'badgeNo',
              'badgeExpiry',
              'policeClearenceExpiry',
              'medFitExpiry',
              'defaultCabRegNo',
              'status',
            ],
            include: [
              {
                model: DriverDocumentUpload,
                as: 'documents',
                attributes: ['title', 'url'],
              },
            ],
          },
          {
            model: Organization,
            as: 'org',
            attributes: ['id', 'name'],
          },
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['name'],
          },
        ],
      });

      if (!orgDriver) {
        throw new NotFoundException('Invalid organization driver id');
      }

      const item: any = orgDriver.toJSON();

      const driverOrgRequest = await this.driverOrgRequestModel.findOne({
        where: {
          driverID: item.driverID,
          orgID: item.orgID,
        },
        include: [
          {
            model: DriverOrgRequestDocumentUpload,
            as: 'documents',
            attributes: ['title', 'url'],
          },
        ],
      });

      if (driverOrgRequest) {
        const driverReq = driverOrgRequest.toJSON();

        item.driver = {
          ...item.driver,
          ...driverReq,
          documents: driverReq.documents,
        };
      }

      return {
        message: 'Driver found',
        data: item,
      };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async updateDriverStatus(
    updateOrgDriverInput: UpdateOrgDriverInput,
    user: any,
  ): Promise<GenericResponse<OrganizationDriver[]>> {
    try {
      const { ids, status } = updateOrgDriverInput;
      const updateStatus =
        status === 'Approve'
          ? Status.Approved
          : status === 'Reject'
          ? Status.Rejected
          : status;
      // Approval is an org-side action: the vendor invites (assignDrivers:65-82
      // writes Pending), the org's admin flips it. Scope every read and the
      // write to the caller's org so ids from another tenant cannot be touched.
      const scope: any = { id: ids };
      if (user?.userType !== UserType.SuperAdmin) {
        if (!user?.orgID) {
          return {
            message: 'No valid drivers found for update',
            data: [],
          };
        }
        scope.orgID = user.orgID;
      }
      const existingDrivers = await this.orgDriverModel.findAll({
        where: scope,
      });

      if (!existingDrivers.length) {
        return {
          message: 'No valid drivers found for update',
          data: [],
        };
      }
      await this.orgDriverModel.update(
        { status: updateStatus },
        { where: scope },
      );

      const updatedDrivers = await this.orgDriverModel.findAll({
        where: scope,
      });
      const eventLogs = updatedDrivers.map((orgDriver) => ({
        objectType: 'OrganizationDriver',
        changeType: 'update',
        objectID: orgDriver.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: { status },
        requestPayload: { status },
      }));

      if (eventLogs.length > 0) {
        await this.eventlogService.bulkCreate(eventLogs);
      }

      return {
        message: `Driver statuses updated to ${status}`,
        data: updatedDrivers,
      };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }
}
