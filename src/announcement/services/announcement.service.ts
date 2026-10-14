import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Announcement } from '../models/announcement.model';
import { CreateAnnouncementInput } from '../dtos/create-announcement-input.dto';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { AnnouncementFilterInput } from '../dtos/announcement-filter-input-dto';
import { SortOrder, Status } from 'src/shared/enums';
import { UpdateAnnouncementInput } from '../dtos/update-announcement-input.dto';
import { Op } from 'sequelize';
import { Organization } from 'src/organization/models/organization.model';
import { Team } from 'src/team/models/team.model';
import { Employee } from 'src/employee/models/employee.model';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectModel(Announcement)
    private announcementModel: typeof Announcement,
    @InjectModel(Team)
    private teamModel: typeof Team,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    private eventlogService: EventLogService,
  ) {}

  async create(
    createAnnouncementInput: CreateAnnouncementInput,
    user?: any,
  ): Promise<GenericResponse<Announcement>> {
    try {
      // Optional: guard against a team from a different org being attached
      if (createAnnouncementInput.teamID) {
        const team = await this.teamModel.findOne({
          where: { id: createAnnouncementInput.teamID, orgID: user.orgID },
        });
        if (!team) {
          throw new BadRequestException('Invalid team for this organization.');
        }
      }
      const announcement = await this.announcementModel.create({
        ...createAnnouncementInput,
        orgID: user.orgID,
      });

      // Formats endDate as DD/MM/YYYY, date-only — avoids adding a new
      // date-library import here by using plain Date methods, since
      // endDate always arrives/stores as a full ISO timestamp otherwise.
      const formatDateOnly = (value: any): string | null => {
        if (!value) return null;
        const d = new Date(value);
        if (isNaN(d.getTime())) return null;
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      };

      const eventLog = {
        objectType: createAnnouncementInput.teamID
          ? 'Team Announcement'
          : 'Org Announcement',
        changeType: 'add',
        objectID: announcement.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: {
          announcementID: announcement.id,
          title: announcement.title,
          description: announcement.description,
          endDate: formatDateOnly(announcement.endDate),
          status: announcement.status,
        },
        requestPayload: JSON.parse(JSON.stringify(createAnnouncementInput)),
        customDescription: `created new Announcement - "${announcement.title}"`,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        message: 'Announcement created successfully',
        data: announcement,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAll(
    announcementFilterInput: AnnouncementFilterInput,
    user: any,
  ): Promise<PaginatedList<Announcement>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.ASC,
        status,
      } = announcementFilterInput;
      const whereClause: any = {
        orgID: user.orgID,
        teamID: null, // Only organization announcements
      };
      if (status) {
        whereClause['status'] = status;
      }
      const announcement = await this.announcementModel.findAndCountAll({
        distinct: true,
        where: whereClause,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        include: [
          {
            model: Organization,
            as: 'organization',
            attributes: ['name', 'email', 'phone', 'address', 'gstNo'],
          },
        ],
      });

      return {
        totalItems: announcement.count,
        items: announcement.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getActiveAnnouncement(user: any): Promise<Announcement[]> {
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      await this.announcementModel.update(
        { status: Status.Inactive },
        {
          where: {
            status: Status.Active,
            endDate: {
              [Op.lt]: now,
            },
            orgID: user.orgID,
          },
        },
      );
      // console.log("user--->",user)

      const employee = await this.employeeModel.findByPk(user.employeeID, {
        attributes: ['teamID'],
      });

      // console.log("employee--->",employee)

      const whereClause: any = {
        orgID: user.orgID,
        status: Status.Active,
        endDate: {
          [Op.gte]: now,
        },
      };

      if (employee?.teamID) {
        whereClause[Op.or] = [
          {
            teamID: null,
          },
          {
            teamID: employee.teamID,
          },
        ];
      } else {
        whereClause.teamID = null;
      }

      const announcements = await this.announcementModel.findAll({
        where: whereClause,
        include: [
          {
            model: Team,
            as: 'team',
            attributes: ['id', 'name'],
            required: false, // org announcements have teamID = null
          },
        ],
        order: [
          ['teamID', 'DESC'],
          ['endDate', 'ASC'],
        ],
      });

      if (!announcements) {
        return null;
      }

      return announcements;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async getActiveAnnouncement(user: any): Promise<Announcement> {
  //   try {
  //     const now = new Date();
  //     now.setHours(0, 0, 0, 0);
  //     await this.announcementModel.update(
  //       { status: Status.Inactive },
  //       {
  //         where: {
  //           status: Status.Active,
  //           endDate: { [Op.lt]: now },
  //           orgID: user.orgID,
  //         },
  //       },
  //     );
  //     const announcement = await this.announcementModel.findOne({
  //       where: {
  //         status: Status.Active,
  //         endDate: { [Op.gte]: now },
  //       },
  //       order: [['endDate', 'ASC']],
  //     });
  //     if (!announcement) {
  //       return null;
  //     }
  //     return announcement;
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  // async getActiveAnnouncement(user: any): Promise<Announcement> {
  //   try {
  //     const now = new Date();
  //     now.setHours(0, 0, 0, 0);

  //     const latestAnnouncement = await this.announcementModel.findOne({
  //       where: {
  //         status: Status.Active,
  //         orgID: user.orgID,
  //         endDate: { [Op.gte]: now },
  //       },
  //       order: [['createdAt', 'DESC']],
  //     });
  //     if (!latestAnnouncement) {
  //       return null;
  //     }
  //     await this.announcementModel.update(
  //       { status: Status.Inactive },
  //       {
  //         where: {
  //           status: Status.Active,
  //           orgID: user.orgID,
  //           id: { [Op.ne]: latestAnnouncement.id },
  //         },
  //       },
  //     );

  //     return latestAnnouncement;
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async findOne(id: string): Promise<GenericResponse<Announcement>> {
    try {
      const announcement = await this.announcementModel.findOne({
        where: { id },
      });
      if (announcement)
        return {
          message: 'Announcement found',
          data: announcement,
        };
      else throw new NotFoundException('Invalid id');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async update(
  //   id: string,
  //   updateAnnouncementInput: UpdateAnnouncementInput,
  //   user: any,
  // ): Promise<any> {
  //   try {
  //     const existingAnnouncement = await this.findOne(id);
  //     const announcement = await this.announcementModel.update(
  //       updateAnnouncementInput,
  //       {
  //         where: { id },
  //         returning: true,
  //       },
  //     );
  //     const eventPayload = JSON.parse(JSON.stringify(updateAnnouncementInput));
  //     const eventLog = {
  //       objectType: 'Announcement',
  //       changeType: 'edit',
  //       objectID: id,
  //       authID: user.id,
  //       orgID: user.orgID,
  //       updatedBy: user.name,
  //       payload: existingAnnouncement,
  //       requestPayload: eventPayload,
  //     };
  //     this.eventlogService.create(eventLog);
  //     return {
  //       status: true,
  //       message: 'Announcement updated successfully',
  //       data: announcement,
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
    updateAnnouncementInput: UpdateAnnouncementInput,
    user: any,
    teamID?: string,
  ): Promise<any> {
    try {
      const existingAnnouncementRes = await this.findOne(id);
      const existingAnnouncement = existingAnnouncementRes.data; // unwrap

      if (!existingAnnouncement) {
        throw new NotFoundException('Announcement not found');
      }

      // prevent cross-team edits when called from a team-scoped route
      if (teamID && String(existingAnnouncement.teamID) !== String(teamID)) {
        throw new NotFoundException('Announcement not found for this team');
      }

      const where: any = { id };
      if (teamID) where.teamID = teamID;

      const announcement = await this.announcementModel.update(
        updateAnnouncementInput,
        {
          where, // <-- use the scoped where, not { id }
          returning: true,
        },
      );
      const updatedAnnouncement = announcement?.[1]?.[0];

      // Formats a date as DD/MM/YYYY, date-only.
      const formatDateOnly = (value: any): string | null => {
        if (!value) return null;
        const d = new Date(value);
        if (isNaN(d.getTime())) return null;
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      };

      // Dates can arrive as a string from the client but read back as a
      // Date instance from Sequelize — normalize to date-only before
      // comparing so an unchanged endDate doesn't register as a diff.
      const normalizeForDiff = (value: any) => {
        if (value instanceof Date) return value.toISOString().split('T')[0];
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
          return value.split('T')[0];
        }
        return value;
      };

      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      for (const key of Object.keys(updateAnnouncementInput)) {
        const oldValue = normalizeForDiff(existingAnnouncement[key]);
        const newValue = normalizeForDiff(updateAnnouncementInput[key]);
        if (oldValue !== newValue) {
          // endDate gets the DD/MM/YYYY treatment in the diff too, so
          // Old/New Value columns show a readable date, not a raw ISO
          // timestamp, for every other field the raw value is used as-is.
          changeJSON[key] = {
            OldValue:
              key === 'endDate'
                ? formatDateOnly(existingAnnouncement[key])
                : existingAnnouncement[key],
            newValue:
              key === 'endDate'
                ? formatDateOnly(updateAnnouncementInput[key])
                : updateAnnouncementInput[key],
          };
        }
      }

      const eventPayload = JSON.parse(JSON.stringify(updateAnnouncementInput));
      const announcementTitle =
        updatedAnnouncement?.title ?? existingAnnouncement.title;
      const eventLog = {
        objectType: teamID ? 'Team Announcement' : 'Org Announcement',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: {
          announcementID: id,
          title: announcementTitle,
        },
        requestPayload: eventPayload,
        changeJSON,
        customDescription: `updated Announcement - "${announcementTitle}"`,
        user,
      };
      this.eventlogService.create(eventLog);

      return {
        status: true,
        message: 'Announcement updated successfully',
        data: announcement,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async delete(id: string, user: any): Promise<GenericResponse<null>> {
    try {
      const existingAnnouncement = await this.announcementModel.findOne({
        where: { id },
      });

      const response = await this.announcementModel.destroy({
        where: {
          id,
        },
      });

      if (response !== 0) {
        // Formats a date as DD/MM/YYYY, date-only.
        const formatDateOnly = (value: any): string | null => {
          if (!value) return null;
          const d = new Date(value);
          if (isNaN(d.getTime())) return null;
          const day = String(d.getUTCDate()).padStart(2, '0');
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const year = d.getUTCFullYear();
          return `${day}/${month}/${year}`;
        };

        const eventLog = {
          objectType: 'Announcement',
          changeType: 'delete',
          objectID: id,
          authID: user.id,
          orgID: user.orgID,
          updatedBy: user.name,
          payload: {
            announcementID: id,
            title: existingAnnouncement?.title,
            description: existingAnnouncement?.description,
            endDate: formatDateOnly(existingAnnouncement?.endDate),
          },
          requestPayload: id,
          customDescription: `removed Announcement - "${
            existingAnnouncement?.title ?? 'Unknown'
          }"`,
          user,
        };
        this.eventlogService.create(eventLog);

        return {
          message: 'Announcement deleted successfully',
          data: null,
        };
      } else throw new NotFoundException(`Announcement not found`);
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
