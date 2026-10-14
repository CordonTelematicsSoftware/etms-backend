import {
  BadRequestException,
  forwardRef,
  Inject,
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

import { GmsCategory } from '../models/gms-category.model';
import { CreateGmsCategoryInput } from '../dtos/create-gms-category-input.dto';
import { FilterGmsCategoryInput } from '../dtos/filter-gms-category.input.dto';
import { UpdateGmsCategoryInput } from '../dtos/update-gms-category-input.dto';
import { GrievanceService } from 'src/grievance/services/grievance.service';
import { uniqueCategoryCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';

@Injectable()
export class GmsCategoryService {
  constructor(
    @InjectModel(GmsCategory)
    private gmsCategoryModel: typeof GmsCategory,

    private eventlogService: EventLogService,
    @Inject(forwardRef(() => GrievanceService))
    private readonly grievanceService: GrievanceService,
  ) {}

  async create(
    creategmsCategoryInput: CreateGmsCategoryInput,
    currentUser?: any,
  ): Promise<GenericResponse<GmsCategory>> {
    try {
      const validationErrors = await uniqueCategoryCheck(
        this.gmsCategoryModel,
        ['name'],
        creategmsCategoryInput,
        null,
        currentUser?.orgID,
        null,
      );
      handleErrors(validationErrors, 'unique');

      const gmsCategory = await this.gmsCategoryModel.create({
        ...creategmsCategoryInput,
        orgId: currentUser?.orgID,
      });

      const eventPayload = JSON.parse(JSON.stringify(creategmsCategoryInput));
      // Was payload: gmsCategory — the raw model instance. alertEmails is
      // an array, and DetailTable's payloadJSON branch treats any
      // object-typed value as "look for .label", which arrays don't
      // have, so it rendered blank. Joined into a readable string.
      const eventLog = {
        objectType: 'GmsCategory',
        changeType: 'add',
        objectID: gmsCategory.id,
        authID: currentUser.id,
        orgID: currentUser?.orgID,
        updatedBy: currentUser.name,
        payload: {
          id: gmsCategory.id,
          name: gmsCategory.name,
          priority: gmsCategory.priority,
          alertEmails: Array.isArray(gmsCategory.alertEmails)
            ? gmsCategory.alertEmails.join(', ')
            : gmsCategory.alertEmails,
          description: gmsCategory.description,
          notificationOn: gmsCategory.notificationOn,
          attachmentRequired: gmsCategory.attachmentRequired,
        },
        requestPayload: eventPayload,
        user: currentUser,
      };
      await this.eventlogService.create(eventLog);

      return {
        message: 'GMS Category created successfully',
        data: gmsCategory,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAll(
    filterGmsCategoryInput: FilterGmsCategoryInput,
    currentUser?: any,
  ): Promise<PaginatedList<GmsCategory>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        status,
      } = filterGmsCategoryInput;

      let whereClause: any = {};
      if (status) {
        whereClause.status = status;
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

      if (currentUser.orgID) {
        whereClause.orgId = currentUser?.orgID;
      }
      const gmsCategory = await this.gmsCategoryModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,
      });

      return {
        totalItems: gmsCategory.count,
        items: gmsCategory.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: bigint): Promise<GenericResponse<GmsCategory>> {
    try {
      const whereClause: any = {};

      whereClause.id = id;
      const gmsCategory = await this.gmsCategoryModel.findOne({
        where: whereClause,
      });
      if (gmsCategory) {
        return {
          message: 'Gms Category found',
          data: gmsCategory,
        };
      } else {
        throw new NotFoundException('Gms Category not found');
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
    updateGmsCategoryInput: UpdateGmsCategoryInput,
    user: any,
  ): Promise<any> {
    try {
      const gmsCategory = await this.gmsCategoryModel.findOne({
        where: { id: id },
      });

      if (!gmsCategory) {
        throw new NotFoundException('Gms Category not found');
      }

      const updatedGmsCategory = await this.gmsCategoryModel.update(
        {
          ...updateGmsCategoryInput,
        },
        {
          where: { id },
          returning: true,
        },
      );
      const updatedRow = updatedGmsCategory?.[1]?.[0];

      // Was payload: updatedGmsCategory — the raw [affectedCount, rows[]]
      // tuple .update() returns, not a plain object. DetailTable's
      // payloadJSON branch did Object.entries() on that tuple (keys
      // "0"/"1", neither with a .label), so every row rendered blank.
      // Real per-field diff instead, using `gmsCategory` (fetched
      // pre-update) as the old-value source. alertEmails is an array so
      // it's joined to a string, same as create()'s payload fix.
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      for (const key of Object.keys(updateGmsCategoryInput)) {
        const oldValue = (gmsCategory as any)[key];
        const newValue = (updateGmsCategoryInput as any)[key];
        const oldForCompare = Array.isArray(oldValue)
          ? oldValue.join(', ')
          : oldValue;
        const newForCompare = Array.isArray(newValue)
          ? newValue.join(', ')
          : newValue;
        if (oldForCompare !== newForCompare) {
          changeJSON[key] = {
            OldValue: oldForCompare,
            newValue: newForCompare,
          };
        }
      }

      const eventPayload = JSON.parse(JSON.stringify(updateGmsCategoryInput));
      const fieldCount = Object.keys(changeJSON).length;
      const categoryName = updatedRow?.name ?? gmsCategory.name;

      const eventLog = {
        objectType: 'GmsCategory',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: {
          id,
          name: categoryName,
        },
        requestPayload: eventPayload,
        changeJSON,
        customDescription:
          fieldCount > 1
            ? `updated ${fieldCount} fields in GmsCategory (${categoryName})`
            : `updated GmsCategory (${categoryName})`,
        user,
      };
      await this.eventlogService.create(eventLog);

      // Was missing entirely — the try block fell through to undefined
      // on success, so callers got no confirmation or updated data back.
      return {
        message: 'Gms Category updated successfully',
        data: updatedRow,
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
      const grievance = await this.grievanceService.findCategory(id);

      if (grievance.data) {
        throw new BadRequestException(
          'A grievance has already been created for this category, hence it cannot be deleted.',
        );
      } else {
        // Fetched before destroy() so there's a real snapshot of what
        // was deleted — was payload: '', a literal empty string, so
        // expanding this row showed nothing.
        const gmsCategory = await this.gmsCategoryModel.findOne({
          where: { id },
        });

        const eventLog = {
          objectType: 'GmsCategory',
          changeType: 'delete',
          objectID: id,
          authID: user.id,
          orgID: user.orgID,
          updatedBy: user.name,
          payload: {
            id,
            name: gmsCategory?.name,
            priority: gmsCategory?.priority,
          },
          requestPayload: id,
          user,
        };
        this.eventlogService.create(eventLog);
        await this.gmsCategoryModel.destroy({
          where: {
            id,
          },
        });
        return {
          message: 'Gms Category  deleted successfully',
          data: null,
        };
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
