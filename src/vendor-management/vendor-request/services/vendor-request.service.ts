import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { VendorRequest } from '../models/vendor-request.model';
import { VendorRequestFilterInput } from '../dtos/vendor-request-filter-input.dto';
import { RequestStatus, SortOrder, UserType } from 'src/shared/enums';
import { CreateVendorRequestInput } from '../dtos/create-vendor-request-input.dto';
import { Vendor } from 'src/vendor-management/vendor/models/vendor.model';
import { Organization } from 'src/organization/models/organization.model';
import { UpdateVendorRequestInput } from '../dtos/update-vendor-request-input.dto';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { City } from 'src/city/models/city.model';
import { VendorAccess } from 'src/vendor-management/vendor-access/models/vendor-access.model';

@Injectable()
export class VendorRequestService {
  constructor(
    @InjectModel(VendorRequest)
    private vendorRequestModel: typeof VendorRequest,
    @InjectModel(VendorAccess)
    private vendorAccessModel: typeof VendorAccess,
    private eventlogService: EventLogService,
  ) {}

  async organizationRequest(
    createVendorRequestInput: CreateVendorRequestInput,
    user: any,
  ): Promise<GenericResponse<VendorRequest>> {
    try {
      const vendorOrg = await this.vendorRequestModel.create({
        vendorID: createVendorRequestInput?.vendorID,
        orgID: createVendorRequestInput?.orgID,
        requestStatus:
          createVendorRequestInput?.requestStatus == null
            ? RequestStatus?.Pending
            : RequestStatus?.Invited,
        description: createVendorRequestInput?.description,
        createdBy: user?.id,
      });
      const eventPayload = JSON.parse(JSON.stringify(createVendorRequestInput));
      const eventLog = {
        objectType: 'Vendor request',
        changeType: 'add',
        objectID: vendorOrg.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: vendorOrg,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Organization request submitted successfully',
        data: vendorOrg,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    vendorRequestFilterInput: VendorRequestFilterInput,
    user?: any,
  ): Promise<PaginatedList<VendorRequest>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        requestStatus,
      } = vendorRequestFilterInput;
      const whereCondition = this.buildWhereCondition(
        requestStatus,
        user?.orgID,
        user?.userType,
        user?.vendorID,
      );

      const orderClause: any[] = [];

      if (sortBy.includes('.')) {
        const [association, field] = sortBy.split('.');
        if (association === 'cab') {
          orderClause.push([{ model: Vendor, as: 'vendor' }, field, sortOrder]);
        }
      } else {
        orderClause.push([sortBy, sortOrder]);
      }

      const trips = await this.vendorRequestModel.findAndCountAll({
        where: whereCondition,
        order: orderClause,
        limit: take,
        offset: skip * take,
        attributes: ['id', 'orgID', 'vendorID', 'requestStatus'],
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo', 'code'],
          },
          {
            model: Organization,
            as: 'organization',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo'],
          },
        ],
      });

      return {
        totalItems: trips.count,
        items: trips.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllVendors(
    vendorRequestFilterInput: VendorRequestFilterInput,
    user?: any,
  ): Promise<PaginatedList<VendorRequest>> {
    try {
      const {
        // take = 25,
        // skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        requestStatus,
      } = vendorRequestFilterInput;
      const whereCondition = this.buildWhereCondition(
        requestStatus,
        user?.orgID,
        user?.userType,
        user?.vendorID,
      );

      const orderClause: any[] = [];

      if (sortBy.includes('.')) {
        const [association, field] = sortBy.split('.');
        if (association === 'cab') {
          orderClause.push([{ model: Vendor, as: 'vendor' }, field, sortOrder]);
        }
      } else {
        orderClause.push([sortBy, sortOrder]);
      }

      const trips = await this.vendorRequestModel.findAndCountAll({
        where: whereCondition,
        order: orderClause,
        // limit: take,
        // offset: skip * take,
        attributes: ['id', 'orgID', 'vendorID', 'requestStatus'],
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo', 'code'],
          },
          {
            model: Organization,
            as: 'organization',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo'],
          },
        ],
      });

      return {
        totalItems: trips.count,
        items: trips.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  private buildWhereCondition(
    requestStatus: string,
    orgID: any,
    userType: any,
    vendorID: any,
  ): any {
    const conditions: Record<string, any> = {};
    switch (requestStatus) {
      case 'rejected':
        conditions.requestStatus = RequestStatus.Rejected;
        userType == UserType.Employee
          ? (conditions.orgID = orgID)
          : (conditions.vendorID = vendorID);
        break;
      case 'approved':
        conditions.requestStatus = RequestStatus.Approved;
        userType == UserType.Employee
          ? (conditions.orgID = orgID)
          : (conditions.vendorID = vendorID);
        break;
      case 'pending':
        conditions.requestStatus = RequestStatus.Pending;
        userType == UserType.Employee
          ? (conditions.orgID = orgID)
          : (conditions.vendorID = vendorID);
        break;
      case 'cancelled':
        conditions.requestStatus = RequestStatus.Cancelled;
        userType == UserType.Employee
          ? (conditions.orgID = orgID)
          : (conditions.vendorID = vendorID);
        break;
      case 'invited':
        conditions.requestStatus = RequestStatus.Invited;
        userType == UserType.Employee
          ? (conditions.orgID = orgID)
          : (conditions.vendorID = vendorID);
        break;
      default:
        break;
    }
    return conditions;
  }

  async findAllOrg(
    vendorRequestFilterInput: VendorRequestFilterInput,
    user?: any,
    orgID?: string,
  ): Promise<PaginatedList<VendorRequest>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
      } = vendorRequestFilterInput;
      const whereCondition = {
        requestStatus: RequestStatus.Approved,
        vendorID: user?.vendorID,
        orgID: orgID,
      };
      const trips = await this.vendorRequestModel.findAndCountAll({
        where: whereCondition,
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        attributes: ['id', 'orgID', 'vendorID', 'requestStatus'],
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo', 'code'],
          },
          {
            model: Organization,
            as: 'organization',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo'],
          },
        ],
      });

      return {
        totalItems: trips.count,
        items: trips.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllApprovedOrgOfVendor(
    vendorRequestFilterInput: VendorRequestFilterInput,
    user?: any,
  ): Promise<PaginatedList<VendorRequest>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
      } = vendorRequestFilterInput;

      // NEW — if the caller is a sub-user (VendorAccess row exists for their auth id),
      // restrict results to their assigned orgIDs. Primary admin (no VendorAccess row) unaffected.
      const callerAccess = await this.vendorAccessModel.findOne({
        where: { authID: user?.id, vendorID: user?.vendorID },
      });

      const whereCondition: any = {
        requestStatus: RequestStatus.Approved,
        vendorID: user?.vendorID,
      };
      if (callerAccess) {
        whereCondition.orgID = {
          [Op.in]: (callerAccess.orgIDs || []).map(String),
        };
      }

      const approvedRequests = await this.vendorRequestModel.findAndCountAll({
        where: whereCondition,
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        attributes: ['id', 'orgID', 'vendorID', 'requestStatus'],
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo', 'code'],
          },
          {
            model: Organization,
            as: 'organization',
            attributes: [
              'id',
              'name',
              'email',
              'phone',
              'address',
              'gstNo',
              'status',
            ],
            include: [
              {
                model: City,
                as: 'city',
                attributes: ['id', 'name'],
              },
            ],
          },
        ],
      });

      return {
        totalItems: approvedRequests.count,
        items: approvedRequests.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string): Promise<GenericResponse<VendorRequest>> {
    try {
      const vendorUserOrg = await this.vendorRequestModel.findOne({
        where: { id },
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo'],
          },
          {
            model: Organization,
            as: 'organization',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo'],
          },
        ],
      });
      if (vendorUserOrg)
        return {
          message: 'Vendor Organization found',
          data: vendorUserOrg,
        };
      else throw new NotFoundException('Invalid id');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOneByOrg(
    orgID: string,
    user: any,
  ): Promise<GenericResponse<VendorRequest>> {
    try {
      const vendorRequest = await this.vendorRequestModel.findOne({
        where: { orgID: orgID, vendorID: user.vendorID },
        include: [
          {
            model: Vendor,
            as: 'vendor',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo'],
          },
          {
            model: Organization,
            as: 'organization',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo'],
          },
        ],
      });

      if (vendorRequest) {
        return {
          message: 'Vendor Request found',
          data: vendorRequest,
        };
      } else {
        throw new NotFoundException(
          'No vendor request found for this organization',
        );
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
    updateVendorRequestInput: UpdateVendorRequestInput,
    user: any,
  ): Promise<any> {
    try {
      const vendorRequestById = await this.findOne(id);
      const vendorRequest = await this.vendorRequestModel.update(
        updateVendorRequestInput,
        {
          where: { id },
          returning: true,
        },
      );
      const eventPayload = JSON.parse(JSON.stringify(updateVendorRequestInput));
      const eventLog = {
        objectType: 'Vendor request',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: vendorRequestById.data,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Vendor request updated successfully',
        data: vendorRequest?.[1]?.[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async delete(id: string): Promise<GenericResponse<null>> {
    try {
      await this.vendorRequestModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'Vendor request deleted successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async vendorRequestApprovalByOrg(
    id: any,
    requestStatus: any,
    description: any,
    reason: any,
    user: any,
  ): Promise<GenericResponse<VendorRequest>> {
    const vendorRequestById = await this.findOne(id);
    const updateRequestInput = {
      requestStatus: requestStatus,
      description: description,
      reason: reason,
    };
    await this.vendorRequestModel.update(updateRequestInput, {
      where: {
        id: id,
        // token: token, // Match userType exactly
        // invalidated: false,
      },
    });
    const eventPayload = JSON.parse(JSON.stringify(updateRequestInput));
    const eventLog = {
      objectType: 'Vendor request',
      changeType: 'edit',
      objectID: id,
      authID: user.id,
      orgID: user.orgID,
      updatedBy: user.name,
      payload: vendorRequestById.data,
      requestPayload: eventPayload,
      user,
    };
    this.eventlogService.create(eventLog);
    return {
      status: true,
      message: '',
    };
  }
}
