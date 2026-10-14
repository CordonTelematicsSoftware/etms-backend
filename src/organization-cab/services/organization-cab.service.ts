import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Op, Sequelize } from 'sequelize';
import { OrganizationCab } from '../models/organizationCab.model';
import { InjectModel } from 'node_modules/@nestjs/sequelize';
import { CreateOrgCabInput } from '../dtos/create-orgCab-input.dto';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { EventLogService } from 'src/eventlog/eventlog.service';
import {
  RequestStatus,
  SortOrder,
  Status,
  TripStatus,
  UserType,
} from 'src/shared/enums';
import { OrgCabFilterInput } from '../dtos/orgCab-filter-input.dto';
import { Cab } from 'src/cabs/models/cab.model';
import { UpdateOrgCabInput } from '../dtos/update-orgCab-input.dto';
import { Organization } from 'src/organization/models/organization.model';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Driver } from 'src/drivers/models/driver.model';
import { CabDocumentUpload } from 'src/cabs/models/cabDocumentUpload.model';
import { OrganizationDriver } from 'src/organization-driver/models/organizationDriver.model';
import { Location } from 'src/location-management/locations/models/location.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import * as QRCode from 'qrcode';
import * as moment from 'moment';
import { CabOrgRequest } from 'src/approval-request/models/cab-org-approval-req.model';
import { CabOrgRequestDocumentUpload } from 'src/approval-request/models/cab-org-req-document-upload.model';
import { VendorRequest } from 'src/vendor-management/vendor-request/models/vendor-request.model';
import { CordonGpsApiService } from 'src/cordon-gps/services/cordon-gps-api.service';
import { cordonBatchPointToGpsPoint } from 'src/cordon-gps/utils/cordon-gps-point.mapper';
import { NearbyCabsInput } from '../dtos/nearby-cabs-input.dto';
import {
  parseGeoCode,
  parseLatLngStrings,
  haversineDistanceKm,
  // LatLng,
} from 'src/shared/utils/geo.util';

@Injectable()
export class OrganizationCabService {
  constructor(
    @InjectModel(OrganizationCab)
    private orgCabModel: typeof OrganizationCab,
    @InjectModel(Cab)
    private cabModel: typeof Cab,
    @InjectModel(Driver)
    private driverModel: typeof Driver,
    @InjectModel(VendorRequest)
    private vendorRequestModel: typeof VendorRequest,
    @InjectModel(Location)
    private locationModel: typeof Location,
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    @InjectModel(CabOrgRequest)
    private cabOrgRequestModel: typeof CabOrgRequest,
    @InjectModel(OrganizationDriver)
    private orgDriverModel: typeof OrganizationDriver,
    private eventlogService: EventLogService,
    @InjectModel(Organization)
    private organizationModel: typeof Organization,
    private cordonGpsApiService: CordonGpsApiService,
  ) {}

  async assignCabs(
    createOrgCabInput: CreateOrgCabInput,
    user: any,
  ): Promise<GenericResponse<OrganizationCab>> {
    try {
      const { addedCabs, removedCabs } = createOrgCabInput;
      for (const cabInput of removedCabs) {
        const existingCab = await this.orgCabModel.findOne({
          where: {
            cabID: cabInput.cabID,
            orgID: cabInput.orgID,
            vendorID: user.vendorID,
          },
        });
        if (existingCab) {
          await this.orgCabModel.destroy({
            where: {
              cabID: cabInput.cabID,
              orgID: cabInput.orgID,
              vendorID: user.vendorID,
            },
          });
        }
      }
      // const uniqueAddedCabs = [];
      // for (const cabInput of addedCabs) {
      //   const existingCab = await this.orgCabModel.findOne({
      //     where: {
      //       cabID: cabInput.cabID,
      //       orgID: cabInput.orgID,
      //       vendorID: user.vendorID,
      //     },
      //   });
      //   console.log('------------------------existingCab----------', existingCab);

      //   if (!existingCab) {
      //     uniqueAddedCabs.push({
      //       ...cabInput,
      //       vendorID: user.vendorID,
      //       status: RequestStatus.Pending,
      //     });
      //   } else {

      //   }
      // }
      // const createdCabs =
      //   uniqueAddedCabs.length > 0
      //     ? await this.orgCabModel.bulkCreate(uniqueAddedCabs)
      //     : [];
      const uniqueAddedCabs = [];

      for (const cabInput of addedCabs) {
        const existingCab = await this.orgCabModel.findOne({
          where: {
            cabID: cabInput.cabID,
            orgID: cabInput.orgID,
            vendorID: user.vendorID,
          },
        });

        if (!existingCab) {
          uniqueAddedCabs.push({
            ...cabInput,
            vendorID: user.vendorID,
            status: RequestStatus.Pending,
          });
        } else if (existingCab.status === 'Rejected') {
          await existingCab.update({ status: RequestStatus.Pending });
        }
      }
      const createdCabs =
        uniqueAddedCabs.length > 0
          ? await this.orgCabModel.bulkCreate(uniqueAddedCabs)
          : [];
      const eventLogs = createdCabs.map((orgCab) => ({
        objectType: 'OrganizationCab',
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
        message: 'Cabs assigned successfully',
        data: createdCabs[0],
      };
    } catch (error) {
      throw error;
    }
  }

  //   async assignCabs(
  //     createOrgCabInput: CreateOrgCabInput,
  //     user: any,
  //   ): Promise<GenericResponse<OrganizationCab>> {
  //     try {
  //       const { addedCabs, removedCabs } = createOrgCabInput;
  //       for (const cabInput of removedCabs) {
  //         const existingCab = await this.orgCabModel.findOne({
  //           where: {
  //             cabID: cabInput.cabID,
  //             orgID: cabInput.orgID,
  //             vendorID: user.vendorID,
  //           },
  //         });
  //         if (existingCab) {
  //           await this.orgCabModel.destroy({
  //             where: {
  //               cabID: cabInput.cabID,
  //               orgID: cabInput.orgID,
  //               vendorID: user.vendorID,
  //             },
  //           });
  //         }
  //       }
  //       const uniqueAddedCabs = [];

  //       // Get all existing cabs for this organization to check for duplicates
  //       const existingOrgCabs = await this.orgCabModel.findAll({
  //         where: {
  //           orgID: addedCabs[0]?.orgID,
  //         },
  //         include: [{
  //           model: this.cabModel,
  //           attributes: ['regNo']
  //         }]
  //       });
  // console.log('-----------------------existingOrgCabs--------',existingOrgCabs);

  //       // Extract existing registration numbers for quick lookup
  //       const existingRegNos = new Set(
  //         existingOrgCabs.map(orgCab => orgCab.cab?.regNo).filter(Boolean)
  //       );
  // console.log('-----------------------existingRegNos--------',existingOrgCabs);

  //       for (const cabInput of addedCabs) {
  //         // First check if this vendor already has this cab assigned
  //         const existingVendorCab = await this.orgCabModel.findOne({
  //           where: {
  //             cabID: cabInput.cabID,
  //             orgID: cabInput.orgID,
  //             vendorID: user.vendorID,
  //           },
  //         });

  //         // Get only the registration number from cab model
  //         const cabDetails = await this.cabModel.findOne({
  //           where: { id: cabInput.cabID },
  //           attributes: ['regNo'], // Only fetch the registration number
  //           raw: true // Returns plain object for better performance
  //         });

  //         if (!cabDetails) {
  //           continue; // Skip if cab doesn't exist
  //         }

  //         // Check if this registration number already exists for ANY vendor in this org
  //         const isDuplicateRegNo = existingRegNos.has(cabDetails.regNo);
  // console.log('-----------------------isDuplicateRegNo--------',isDuplicateRegNo);

  //         if (!existingVendorCab && !isDuplicateRegNo) {
  //           uniqueAddedCabs.push({
  //             ...cabInput,
  //             vendorID: user.vendorID,
  //             status: RequestStatus.Pending,
  //           });
  //           // Add to the set to prevent duplicates in the same batch
  //           existingRegNos.add(cabDetails.regNo);
  //         } else if (existingVendorCab && existingVendorCab.status === 'Rejected') {
  //           await existingVendorCab.update({ status: RequestStatus.Pending });
  //         }
  //       }

  //       const createdCabs = uniqueAddedCabs.length > 0
  //         ? await this.orgCabModel.bulkCreate(uniqueAddedCabs)
  //         : [];

  //       const eventLogs = createdCabs.map((orgCab) => ({
  //         objectType: 'OrganizationCab',
  //         changeType: 'add',
  //         objectID: orgCab.id,
  //         authID: user.id,
  //         orgID: user.orgID,
  //         updatedBy: user.name,
  //         payload: orgCab,
  //         requestPayload: orgCab,
  //       }));

  //       if (eventLogs.length > 0) {
  //         await this.eventlogService.bulkCreate(eventLogs);
  //       }

  //       return {
  //         message: 'Cabs assigned successfully',
  //         data: createdCabs[0] || null,
  //       };
  //     } catch (error) {
  //       throw error;
  //     }
  //   }

  // async findAllCabsByOrgIDCount(user: any): Promise<any> {
  //   const orgID = user?.orgID ?? user?.employee?.orgID;

  //   const  cabcount = await this.orgCabModel.count({
  //     where: {
  //       orgID,
  //       status: 'Approved',
  //     },
  //     include: [
  //       {
  //         model: Cab,
  //         as: 'cab',
  //         attributes: [],
  //         required: true,
  //         where: {
  //           status: 'Active',
  //         },
  //       },
  //     ],
  //   });
  //   // console.log("cabcount:",cabcount);
  //   return {
  //     cabCount:cabcount
  //   };
  // }
  async getDashboardCounts(user: any) {
    const orgID = user?.orgID ?? user?.employee?.orgID;

    const [cabCount, driverCount, vendorCount] = await Promise.all([
      this.orgCabModel.count({
        where: {
          orgID,
          status: 'Approved',
        },
        include: [
          {
            model: Cab,
            as: 'cab',
            attributes: [],
            required: true,
            where: {
              status: 'Active',
            },
          },
        ],
      }),

      this.orgDriverModel.count({
        where: {
          orgID,
          status: 'Approved',
        },
        include: [
          {
            model: Driver,
            as: 'driver',
            attributes: [],
            required: true,
            where: {
              status: 'Active',
            },
          },
        ],
      }),

      this.vendorRequestModel.count({
        where: {
          orgID,
          requestStatus: 'Approved',
        },
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: [],
            required: true,
            where: {
              status: 'Active',
            },
          },
        ],
      }),
    ]);

    return {
      cabCount,
      driverCount,
      vendorCount,
    };
  }

  async findAllCabsByOrgID(
    orgCabFilterInput: OrgCabFilterInput,
    user: any,
  ): Promise<PaginatedList<OrganizationCab>> {
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
        fuelType,
        model,
        noOfSeats,
        vendorName, // Add search parameter
      } = orgCabFilterInput;

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
      } else {
        whereClause.status = { [Op.ne]: 'Rejected' };
      }
      const cabWhereClause: any = {};

      if (search) {
        cabWhereClause[Op.or] = [
          { regNo: { [Op.iLike]: `%${search}%` } },
          { model: { [Op.iLike]: `%${search}%` } },
          { color: { [Op.iLike]: `%${search}%` } },
          { rcOwner: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (fuelType) {
        cabWhereClause['fuelType'] = { [Op.iLike]: `%${fuelType}%` };
      }
      if (model) {
        cabWhereClause['model'] = { [Op.iLike]: `%${model}%` };
      }
      if (noOfSeats) {
        cabWhereClause['noOfSeats'] = noOfSeats;
      }
      // Add search functionality
      const includeClause: any = [
        {
          model: Cab,
          as: 'cab',
          attributes: [
            'id',
            'vendorID',
            'driverID',
            'driver2ID',
            'regNo',
            'imei',
            'rcOwner',
            'color',
            'noOfSeats',
            'pollutionEndDate',
            'manufacturingDate',
            'model',
            'fuelType',
            'insuranceNumber',
            'insuranceProvider',
            'subVendor',
            'insuranceEndDate',
            'permitExpiry',
            'taxExpiry',
            'fitnessExpiry',
            'status',
            'createdBy',
          ],
          where: {
            ...cabWhereClause,
            status: 'Active', // Only include active cabs
          },
          include: [
            {
              model: CabDocumentUpload,
              as: 'documents',
              attributes: ['id', 'title', 'url'],
            },
            {
              model: Driver,
              as: 'driver',
              attributes: ['id', 'name', 'code', 'phone'],
              required: false, // Left join to avoid filtering out cabs without drivers
            },
            {
              model: Driver,
              as: 'driver2',
              attributes: ['id', 'name', 'code', 'phone'],
              required: false, // Left join to avoid filtering out cabs without driver2
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
            ...(vendorName ? { name: { [Op.iLike]: `%${vendorName}%` } } : {}),
          },
          required: vendorName ? true : false,
        },
      ];

      const orderClause: any[] = [];

      if (sortBy.includes('.')) {
        const [association, field] = sortBy.split('.');
        if (association === 'cab') {
          orderClause.push([{ model: Cab, as: 'cab' }, field, sortOrder]);
        } else if (association === 'cab.driver') {
          orderClause.push([
            { model: Cab, as: 'cab' },
            { model: Driver, as: 'driver' },
            field,
            sortOrder,
          ]);
        }
      } else {
        orderClause.push([sortBy, sortOrder]);
      }

      const orgCabs = await this.orgCabModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: orderClause,
        limit: take,
        offset: skip * take,
        // subQuery: false,
        include: includeClause,
      });
      const items = await Promise.all(
        orgCabs.rows.map(async (row: any) => {
          const item = row.toJSON();

          const cabOrgRequest = await this.cabOrgRequestModel.findOne({
            where: {
              cabID: item.cabID,
              orgID: item.orgID,
            },
            include: [
              {
                model: CabOrgRequestDocumentUpload,
                as: 'documents',
              },
            ],
          });
          if (cabOrgRequest) {
            item.cab = {
              ...item.cab,
              ...cabOrgRequest.toJSON(),
              documents: cabOrgRequest.documents,
            };
          }

          return item;
        }),
      );

      return {
        totalItems: orgCabs.count,
        items,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // ============================================================
  // Replace the entire listCabsByOrg method with this
  // (builds on the version already pasted in — only the exclusion
  // block changed, to also exclude currentTripIDs from the conflict search)
  // No import/constructor changes needed — Trip is already injected.
  // ============================================================

  async listCabsByOrg(
    orgCabFilterInput: OrgCabFilterInput,
    user: any,
  ): Promise<PaginatedList<OrganizationCab>> {
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
        fuelType,
        model,
        noOfSeats,
        vendorName,
        date,
        shiftTime,
        pickDrop,
        currentTripIDs,
      } = orgCabFilterInput;
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
      } else {
        whereClause.status = { [Op.ne]: 'Rejected' };
      }

      if (date && shiftTime && pickDrop) {
        // Scoped exclusion: a cab already committed to ANY non-terminal
        // trip in this same date/shift/direction is unavailable — EXCEPT
        // trips that are part of the current edit session (currentTripIDs).
        // Same reasoning as the driver service: lets an admin reshuffle
        // cabs among a batch of trips they're editing together.
        const excludeTripIDList = currentTripIDs
          ? currentTripIDs
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
          : [];

        const conflictingTrips = await this.tripModel.findAll({
          attributes: ['cabID'],
          where: {
            status: { [Op.notIn]: ['Cancelled', 'Completed'] },
            cabID: { [Op.ne]: null },
            date,
            shiftTime,
            pickDrop,
            ...(excludeTripIDList.length
              ? { id: { [Op.notIn]: excludeTripIDList } }
              : {}),
          },
          raw: true,
        });
        const conflictingCabIDs = conflictingTrips
          .map((t: any) => t.cabID)
          .filter(Boolean);
        whereClause.cabID = {
          [Op.notIn]: conflictingCabIDs.length ? conflictingCabIDs : [0],
        };
      } else {
        // Backward-compat fallback for any caller that hasn't been updated
        // yet to send date/shiftTime/pickDrop.
        whereClause[Op.and] = Sequelize.literal(
          `"OrganizationCab"."cabID" NOT IN (
             SELECT "cabID" FROM "Trips" WHERE "status" = 'Ongoing' AND "cabID" IS NOT NULL
           )`,
        );
      }

      const cabWhereClause: any = {};

      if (search) {
        cabWhereClause[Op.or] = [
          { regNo: { [Op.iLike]: `%${search}%` } },
          { model: { [Op.iLike]: `%${search}%` } },
          { color: { [Op.iLike]: `%${search}%` } },
          { rcOwner: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (fuelType) {
        cabWhereClause['fuelType'] = { [Op.iLike]: `%${fuelType}%` };
      }
      if (model) {
        cabWhereClause['model'] = { [Op.iLike]: `%${model}%` };
      }
      if (noOfSeats) {
        cabWhereClause['noOfSeats'] = noOfSeats;
      }

      const includeClause: any = [
        {
          model: Cab,
          as: 'cab',
          attributes: [
            'id',
            'vendorID',
            'driverID',
            'driver2ID',
            'regNo',
            'rcOwner',
            'color',
            'noOfSeats',
            'pollutionEndDate',
            'manufacturingDate',
            'model',
            'fuelType',
            'insuranceNumber',
            'insuranceProvider',
            'subVendor',
            'insuranceEndDate',
            'permitExpiry',
            'taxExpiry',
            'fitnessExpiry',
            'status',
            'createdBy',
          ],
          where: {
            ...cabWhereClause,
            status: 'Active', // Only include active cabs
          },
          include: [
            {
              model: CabDocumentUpload,
              as: 'documents',
              attributes: ['id', 'title', 'url'],
            },
            {
              model: Driver,
              as: 'driver',
              attributes: ['id', 'name', 'code', 'phone'],
              required: false, // Left join to avoid filtering out cabs without drivers
            },
            {
              model: Driver,
              as: 'driver2',
              attributes: ['id', 'name', 'code', 'phone'],
              required: false, // Left join to avoid filtering out cabs without driver2
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
          where: {
            ...(vendorName ? { name: { [Op.iLike]: `%${vendorName}%` } } : {}),
          },
          required: vendorName ? true : false,
        },
      ];

      const orderClause: any[] = [];

      if (sortBy.includes('.')) {
        const [association, field] = sortBy.split('.');
        if (association === 'cab') {
          orderClause.push([{ model: Cab, as: 'cab' }, field, sortOrder]);
        } else if (association === 'cab.driver') {
          orderClause.push([
            { model: Cab, as: 'cab' },
            { model: Driver, as: 'driver' },
            field,
            sortOrder,
          ]);
        }
      } else {
        orderClause.push([sortBy, sortOrder]);
      }

      const orgCabs = await this.orgCabModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: orderClause,
        limit: take,
        offset: skip * take,
        // subQuery: false,
        include: includeClause,
      });
      return {
        totalItems: orgCabs.count,
        items: orgCabs.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async listAllCabsByOrgID(
  //   orgCabFilterInput: OrgCabFilterInput,
  //   user: any,
  // ): Promise<PaginatedList<OrganizationCab>> {
  //   try {
  //     const {
  //       sortBy = 'id',
  //       sortOrder = SortOrder.DESC,
  //       orgID,
  //       vendorID,
  //       status,
  //       search,
  //       vendorName, // Add search parameter
  //     } = orgCabFilterInput;

  //     const whereClause: any = {};

  //     whereClause.orgID = user?.orgID ? user?.orgID : user?.employee?.orgID;

  //     if (orgID) {
  //       whereClause.orgID = orgID;
  //     }
  //     if (vendorID) {
  //       whereClause.vendorID = vendorID;
  //     }
  //     if (status) {
  //       whereClause.status = status;
  //     }

  //     // Add search functionality
  //     const includeClause: any = [
  //       {
  //         model: Cab,
  //         as: 'cab',
  //         attributes: [
  //           'id',
  //           'vendorID',
  //           'driverID',
  //           'driver2ID',
  //           'regNo',
  //           'rcOwner',
  //           'color',
  //           'noOfSeats',
  //           'pollutionEndDate',
  //           'manufacturingDate',
  //           'model',
  //           'fuelType',
  //           'insuranceNumber',
  //           'insuranceProvider',
  //           'subVendor',
  //           'insuranceEndDate',
  //           'permitExpiry',
  //           'taxExpiry',
  //           'fitnessExpiry',
  //           'status',
  //           'createdBy',
  //         ],
  //         where: search
  //           ? {
  //             [Op.or]: [
  //               { regNo: { [Op.iLike]: `%${search}%` } },
  //               { model: { [Op.iLike]: `%${search}%` } },
  //               { color: { [Op.iLike]: `%${search}%` } },
  //               { rcOwner: { [Op.iLike]: `%${search}%` } },
  //             ],
  //           }
  //           : undefined,
  //         include: [
  //           {
  //             model: CabDocumentUpload,
  //             as: 'documents',
  //             attributes: ['id', 'title', 'url'],
  //           },
  //           {
  //             model: Driver,
  //             as: 'driver',
  //             attributes: ['id', 'name', 'code', 'phone'],
  //             where: search
  //               ? {
  //                 name: { [Op.iLike]: `%${search}%` },
  //               }
  //               : undefined,
  //             required: false, // Left join to avoid filtering out cabs without drivers
  //           },
  //           {
  //             model: Driver,
  //             as: 'driver2',
  //             attributes: ['id', 'name', 'code', 'phone'],
  //             where: search
  //               ? {
  //                 name: { [Op.iLike]: `%${search}%` },
  //               }
  //               : undefined,
  //             required: false, // Left join to avoid filtering out cabs without driver2
  //           },
  //         ],
  //       },
  //       {
  //         model: Organization,
  //         as: 'org',
  //         attributes: ['id', 'name'],
  //       },
  //       {
  //         model: Vendor,
  //         as: 'vendor',
  //         attributes: ['name'],
  //         // where: search
  //         //   ? {
  //         //       name: { [Op.iLike]: `%${search}%` },
  //         //     }
  //         //   : undefined,
  //         where: vendorName
  //           ? { name: { [Op.iLike]: `%${vendorName}%` } }
  //           : undefined,
  //         // required: false,
  //         required: vendorName ? true : false,
  //       },
  //     ];

  //     const orderClause: any[] = [];

  //     if (sortBy.includes('.')) {
  //       const [association, field] = sortBy.split('.');
  //       if (association === 'cab') {
  //         orderClause.push([{ model: Cab, as: 'cab' }, field, sortOrder]);
  //       } else if (association === 'cab.driver') {
  //         orderClause.push([
  //           { model: Cab, as: 'cab' },
  //           { model: Driver, as: 'driver' },
  //           field,
  //           sortOrder,
  //         ]);
  //       }
  //     } else {
  //       orderClause.push([sortBy, sortOrder]);
  //     }

  //     const orgCabs = await this.orgCabModel.findAndCountAll({
  //       distinct: true,
  //       where: whereClause,
  //       order: orderClause,
  //       // limit: take,
  //       // offset: skip * take,
  //       subQuery: false,
  //       include: includeClause,
  //     });

  //     return {
  //       totalItems: orgCabs.count,
  //       items: orgCabs.rows,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async generateQR(id: string, user: any): Promise<GenericResponse<any>> {
    try {
      const orgCab = await this.orgCabModel.findOne({
        where: { id, orgID: user.orgID },
        include: [
          {
            model: Cab,
            as: 'cab',
            attributes: ['id', 'regNo', 'vendorID', 'status'],
          },
        ],
      });

      if (!orgCab) {
        throw new NotFoundException('Invalid Cab id');
      }
      // const timestamp = new Date().toISOString();
      const timestampIST = moment()
        .tz('Asia/Kolkata')
        .format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      const qrPayload = `cab_${orgCab.cab.id}_${orgCab.cab.regNo}_${timestampIST}`;

      const qrCode = await QRCode.toDataURL(JSON.stringify(qrPayload), {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        margin: 2,
        width: 300,
      });

      return {
        message: 'Cab QR generated successfully',
        data: {
          cab: orgCab.cab,
          qrCode,
        },
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async listAllCabsByOrgID(
    orgCabFilterInput: OrgCabFilterInput,
    user: any,
  ): Promise<PaginatedList<OrganizationCab>> {
    try {
      const {
        // take = 25,
        // skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        orgID,
        vendorID,
        status,
        search,
        fuelType,
        model,
        noOfSeats,
        vendorName, // Add search parameter
      } = orgCabFilterInput;

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
      } else {
        whereClause.status = { [Op.ne]: 'Rejected' };
      }
      const cabWhereClause: any = {};

      if (search) {
        cabWhereClause[Op.or] = [
          { regNo: { [Op.iLike]: `%${search}%` } },
          { model: { [Op.iLike]: `%${search}%` } },
          { color: { [Op.iLike]: `%${search}%` } },
          { rcOwner: { [Op.iLike]: `%${search}%` } },
        ];
      }
      if (fuelType) {
        cabWhereClause['fuelType'] = { [Op.iLike]: `%${fuelType}%` };
      }
      if (model) {
        cabWhereClause['model'] = { [Op.iLike]: `%${model}%` };
      }
      if (noOfSeats) {
        cabWhereClause['noOfSeats'] = noOfSeats;
      }
      // Add search functionality
      const includeClause: any = [
        {
          model: Cab,
          as: 'cab',
          attributes: [
            'id',
            'vendorID',
            'driverID',
            'driver2ID',
            'regNo',
            'imei',
            'rcOwner',
            'color',
            'noOfSeats',
            'pollutionEndDate',
            'manufacturingDate',
            'model',
            'fuelType',
            'insuranceNumber',
            'insuranceProvider',
            'subVendor',
            'insuranceEndDate',
            'permitExpiry',
            'taxExpiry',
            'fitnessExpiry',
            'status',
            'createdBy',
          ],

          where: {
            ...cabWhereClause,
            status: 'Active', // Only include active cabs
          },
          include: [
            {
              model: CabDocumentUpload,
              as: 'documents',
              attributes: ['id', 'title', 'url'],
            },
            {
              model: Driver,
              as: 'driver',
              attributes: ['id', 'name', 'code', 'phone'],
              where: search
                ? {
                    name: { [Op.iLike]: `%${search}%` },
                  }
                : undefined,
              required: false, // Left join to avoid filtering out cabs without drivers
            },
            {
              model: Driver,
              as: 'driver2',
              attributes: ['id', 'name', 'code', 'phone'],
              where: search
                ? {
                    name: { [Op.iLike]: `%${search}%` },
                  }
                : undefined,
              required: false, // Left join to avoid filtering out cabs without driver2
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
            ...(search ? { name: { [Op.iLike]: `%${search}%` } } : undefined),
            ...(vendorName ? { name: { [Op.iLike]: `%${vendorName}%` } } : {}),
          },
          // required: false,
          required: vendorName ? true : false,
        },
      ];

      const orderClause: any[] = [];

      if (sortBy.includes('.')) {
        const [association, field] = sortBy.split('.');
        if (association === 'cab') {
          orderClause.push([{ model: Cab, as: 'cab' }, field, sortOrder]);
        } else if (association === 'cab.driver') {
          orderClause.push([
            { model: Cab, as: 'cab' },
            { model: Driver, as: 'driver' },
            field,
            sortOrder,
          ]);
        }
      } else {
        orderClause.push([sortBy, sortOrder]);
      }

      const orgCabs = await this.orgCabModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: orderClause,
        // limit: take,
        // offset: skip * take,
        // subQuery: false,
        include: includeClause,
      });
      return {
        totalItems: orgCabs.count,
        items: orgCabs.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOneOrgCab(
    id: string,
    user: any,
  ): Promise<GenericResponse<OrganizationCab>> {
    try {
      const orgCab = await this.orgCabModel.findOne({
        where: {
          id,
          orgID: user.orgID,
        },
        include: [
          {
            model: Cab,
            as: 'cab',
            attributes: [
              'id',
              'vendorID',
              'driverID',
              'driver2ID',
              'regNo',
              'imei',
              'color',
              'noOfSeats',
              'pollutionEndDate',
              'manufacturingDate',
              'model',
              'fuelType',
              'insuranceNumber',
              'insuranceProvider',
              'insuranceEndDate',
              'permitExpiry',
              'fitnessExpiry',
              'status',
            ],
            include: [
              {
                model: CabDocumentUpload,
                as: 'documents',
                attributes: ['title', 'url'],
              },
              {
                model: Driver,
                as: 'driver',
                attributes: ['name'],
              },
              {
                model: Driver,
                as: 'driver2',
                attributes: ['name'],
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
      //check if any entry present in orgCabRequest table for finding any pending, apptoved or rejected request present
      const item: any = orgCab.toJSON();
      const cabOrgRequest = await this.cabOrgRequestModel.findOne({
        where: {
          cabID: item.cabID,
          orgID: item.orgID,
        },
        include: [
          {
            model: CabOrgRequestDocumentUpload,
            as: 'documents',
            attributes: ['title', 'url'],
          },
          {
            model: Driver,
            as: 'driver',
            attributes: ['name'],
            required: false,
          },
          {
            model: Driver,
            as: 'driver2',
            attributes: ['name'],
            required: false,
          },
        ],
      });

      if (cabOrgRequest) {
        const cabReq = cabOrgRequest.toJSON();

        item.cab = {
          ...item.cab,
          ...cabReq,
          documents: cabReq.documents,
          driver: cabReq.driver,
          driver2: cabReq.driver2,
        };
      }

      if (orgCab)
        return {
          message: 'Cab found',
          data: item,
        };
      else throw new NotFoundException('Invalid organization cab id');
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  // async updateCabStatus(
  //   updateOrgCabInput: UpdateOrgCabInput,
  //   user: any,
  // ): Promise<GenericResponse<OrganizationCab[]>> {
  //   try {
  //     const { ids, status } = updateOrgCabInput;
  //     const updateStatus =
  //       status === 'Approve'
  //         ? Status.Approved
  //         : status === 'Reject'
  //         ? Status.Rejected
  //         : status;
  //     const existingCabs = await this.orgCabModel.findAll({
  //       where: { id: ids },
  //     });

  //     if (!existingCabs.length) {
  //       return {
  //         message: 'No valid cabs found for update',
  //         data: [],
  //       };
  //     }
  //     await this.orgCabModel.update(
  //       { status: updateStatus },
  //       { where: { id: ids } },
  //     );

  //     const updatedCabs = await this.orgCabModel.findAll({
  //       where: { id: ids },
  //     });
  //     const eventLogs = updatedCabs.map((orgCab) => ({
  //       objectType: 'OrganizationCab',
  //       changeType: 'update',
  //       objectID: orgCab.id,
  //       authID: user.id,
  //       orgID: user.orgID,
  //       updatedBy: user.name,
  //       payload: { status },
  //       requestPayload: { status },
  //     }));

  //     if (eventLogs.length > 0) {
  //       await this.eventlogService.bulkCreate(eventLogs);
  //     }

  //     return {
  //       message: `Cab statuses updated to ${status}`,
  //       data: updatedCabs,
  //     };
  //   } catch (error) {
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async updateCabStatus(
    updateOrgCabInput: UpdateOrgCabInput,
    user: any,
  ): Promise<GenericResponse<OrganizationCab[]>> {
    try {
      const { ids, status } = updateOrgCabInput;
      const updateStatus =
        status === 'Approve'
          ? Status.Approved
          : status === 'Reject'
          ? Status.Rejected
          : status;
      // Approval is an org-side action: the vendor invites (assignCabs writes
      // Pending), the org's admin flips it. Scope every read and the write to
      // the caller's org so ids from another tenant cannot be touched. The
      // driver cascade below reads orgID/vendorID off updatedCabs, so scoping
      // that read scopes the cascade too.
      const scope: any = { id: ids };
      if (user?.userType !== UserType.SuperAdmin) {
        if (!user?.orgID) {
          return {
            message: 'No valid cabs found for update',
            data: [],
          };
        }
        scope.orgID = user.orgID;
      }
      const existingCabs = await this.orgCabModel.findAll({
        where: scope,
      });

      if (!existingCabs.length) {
        return {
          message: 'No valid cabs found for update',
          data: [],
        };
      }
      await this.orgCabModel.update({ status: updateStatus }, { where: scope });

      const updatedCabs = await this.orgCabModel.findAll({
        where: scope,
        include: [
          {
            model: Cab,
            as: 'cab',
            include: [
              {
                model: Driver,
                as: 'driver',
              },
              {
                model: Driver,
                as: 'driver2',
              },
            ],
          },
        ],
      });

      const cabDriverDetails = updatedCabs.map((orgCab) => {
        const { orgID, vendorID } = orgCab.dataValues;
        const cab = orgCab.cab;
        return {
          orgID,
          vendorID,
          cabID: cab?.id,
          regNo: cab?.regNo,
          driver1: cab?.driver
            ? { id: cab.driver.id, name: cab.driver.name }
            : null,
          driver2: cab?.driver2
            ? { id: cab.driver2.id, name: cab.driver2.name }
            : null,
        };
      });
      for (const data of cabDriverDetails) {
        const { orgID, vendorID } = data;

        if (data.driver1) {
          const existingDriver1 = await this.orgDriverModel.findOne({
            where: {
              driverID: data.driver1.id,
              orgID,
              vendorID,
              status: Status.Approved, // checks if drivers are approved already
            },
          });

          if (!existingDriver1) {
            const pendingDriver1 = await this.orgDriverModel.findOne({
              where: {
                driverID: data.driver1.id,
                orgID,
                vendorID,
                status: 'Pending', // checks if drivers in pending status
              },
            });

            if (pendingDriver1 && status === 'Approve') {
              await pendingDriver1.update({ status: Status.Approved }); // if pending then change status
            } else if (!pendingDriver1) {
              await this.orgDriverModel.create({
                driverID: data.driver1.id,
                orgID,
                vendorID,
                status: Status.Approved, // if those drivers not in pending or already approved then create new record
              });
            }
          }
        }

        if (data.driver2) {
          const existingDriver2 = await this.orgDriverModel.findOne({
            where: {
              driverID: data.driver2.id,
              orgID,
              vendorID,
              status: Status.Approved,
            },
          });

          if (!existingDriver2) {
            const pendingDriver2 = await this.orgDriverModel.findOne({
              where: {
                driverID: data.driver2.id,
                orgID,
                vendorID,
                status: 'Pending',
              },
            });

            if (pendingDriver2 && status === 'Approve') {
              await pendingDriver2.update({ status: Status.Approved });
            } else if (!pendingDriver2) {
              await this.orgDriverModel.create({
                driverID: data.driver2.id,
                orgID,
                vendorID,
                status: Status.Approved,
              });
            }
          }
        }
      }
      const eventLogs = updatedCabs.map((orgCab) => ({
        objectType: 'OrganizationCab',
        changeType: 'update',
        objectID: orgCab.id,
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
        message: `Cab statuses updated to ${status}`,
        data: updatedCabs,
      };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async findAllCountsByOrgID(user: any): Promise<any> {
    try {
      const currentDate = new Date().toISOString().split('T')[0];
      const locationsCount = await this.locationModel.count({
        where: { orgID: user?.orgID },
      });
      const tripsCompletedCount = await this.tripModel.count({
        where: {
          orgID: user?.orgID,
          vendorID: user?.vendorID,
          status: TripStatus.Completed,
          date: currentDate,
        },
      });
      const tripsPickDropCount = await this.tripModel.count({
        where: {
          orgID: user?.orgID,
          vendorID: user?.vendorID,
          date: currentDate,
        },
      });
      return {
        locationsCount,
        tripsCompletedCount,
        tripsPickDropCount,
      };
    } catch (err) {
      throw new Error('Failed to fetch counts');
    }
  }

  async getNearbyCabs(nearbyCabsInput: NearbyCabsInput, user: any) {
    const orgID = nearbyCabsInput.orgID || user?.orgID || user?.employee?.orgID;

    if (!orgID) {
      throw new BadRequestException('Organization could not be determined.');
    }

    const org = await this.organizationModel.findOne({
      where: { id: orgID },
      attributes: ['id', 'geoCode'],
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const center = parseGeoCode(org.geoCode);
    if (!center) {
      throw new BadRequestException(
        'Organization does not have a valid geoCode configured.',
      );
    }

    // Approved, active cabs for this org that carry a GPS device.
    const orgCabs = await this.orgCabModel.findAll({
      where: { orgID, status: 'Approved' },
      include: [
        {
          model: Cab,
          as: 'cab',
          attributes: ['id', 'regNo', 'imei', 'status'],
          where: { status: 'Active', imei: { [Op.ne]: null } },
          required: true,
        },
      ],
    });
    // console.log('orgCabs found:', orgCabs.length); // <-- add this
    if (!orgCabs.length) {
      return { center, radiusKm: nearbyCabsInput.radiusKm, cabs: [] };
    }

    const imeiToCab = new Map<
      string,
      { id: string; regNo: string; imei: string }
    >();
    for (const oc of orgCabs as any[]) {
      if (oc.cab?.imei) {
        imeiToCab.set(oc.cab.imei, {
          id: String(oc.cab.id),
          regNo: oc.cab.regNo,
          imei: oc.cab.imei,
        });
      }
    }

    const imeis = [...imeiToCab.keys()];
    // console.log('imeis to query Cordon:', imeis); // <-- add this
    const chunks: string[][] = [];
    for (let i = 0; i < imeis.length; i += 100) {
      chunks.push(imeis.slice(i, i + 100));
    }

    const results = await Promise.allSettled(
      chunks.map((chunkImeis) =>
        this.cordonGpsApiService.getLastLocationsByImeis(chunkImeis),
      ),
    );
    // results.forEach((r, i) => {
    // if (r.status === 'rejected') {
    //   console.log('Cordon chunk', i, 'REJECTED:', r.reason); // <-- add this
    // } else {
    //   console.log(
    //     'Cordon chunk',
    //     i,
    //     'returned rows:',
    //     r.value?.data?.length,
    //     r.value?.data,
    //   ); // <-- add this
    // }
    // });
    const cabs: Array<{
      cabID: string;
      regNo: string;
      imei: string;
      lat: number;
      lng: number;
      distanceKm: number;
      [key: string]: any;
    }> = [];

    for (const result of results) {
      if (result.status === 'rejected') continue;

      for (const row of result.value.data ?? []) {
        const cabMeta = imeiToCab.get(row.device_id);
        if (!cabMeta) continue;

        const point = parseLatLngStrings(row.latitude, row.longitude);
        if (!point) continue; // no GPS fix yet, skip rather than guess

        const distanceKm = haversineDistanceKm(center, point);
        if (distanceKm > nearbyCabsInput.radiusKm) continue;

        const mapped = cordonBatchPointToGpsPoint(row);
        cabs.push({
          cabID: cabMeta.id,
          regNo: cabMeta.regNo,
          imei: cabMeta.imei,
          lat: point.lat,
          lng: point.lng,
          distanceKm: Math.round(distanceKm * 100) / 100,
          ...mapped,
        });
      }
    }

    cabs.sort((a, b) => a.distanceKm - b.distanceKm);

    return { center, radiusKm: nearbyCabsInput.radiusKm, cabs };
  }
}
