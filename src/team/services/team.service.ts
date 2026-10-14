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
import { SortOrder, Status } from 'src/shared/enums';
import { UpdateTeamInput } from '../dtos/update-team-input.dto';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';
import { handleErrors } from 'src/shared/utils/format-exception';
import { Sequelize } from 'sequelize-typescript';
import { CreateTeamInput } from '../dtos/create-team-input.dto';
import { TeamFilterInput } from '../dtos/team-filter-input.dto';
import { Team } from '../models/team.model';
import { Process } from 'src/process/models/process.model';
import { Op } from 'sequelize';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Employee } from 'src/employee/models/employee.model';
import { AnnouncementFilterInput } from 'src/announcement/dtos/announcement-filter-input-dto';
import { Announcement } from 'src/announcement/models/announcement.model';
import { Organization } from 'src/organization/models/organization.model';

@Injectable()
export class TeamService {
  private logger = new Logger(TeamService.name);
  constructor(
    @InjectModel(Team)
    private teamModel: typeof Team,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(Announcement)
    private announcementModel: typeof Announcement,
    private readonly sequelize: Sequelize,
    private eventlogService: EventLogService,
  ) {}

  async create(
    createTeamInput: CreateTeamInput,
    user: any,
  ): Promise<GenericResponse<Team>> {
    try {
      const validationErrors = await uniqueFieldsCheck(
        this.teamModel,
        ['name'],
        createTeamInput,
        '',
        user?.orgID,
      );

      handleErrors(validationErrors, 'unique');
      const team = await this.teamModel.create({
        ...createTeamInput,
        orgID: user?.orgID,
      });
      const eventPayload = JSON.parse(JSON.stringify(createTeamInput));
      const eventLog = {
        objectType: 'Team',
        changeType: 'add',
        objectID: team.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: team,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        message: 'Team created successfully',
        data: team,
      };
    } catch (error) {
      throw error;
    }
  }

  async findAll(
    teamFilterInput: TeamFilterInput,
    user: any,
  ): Promise<PaginatedList<Team>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        search,
        sortOrder = SortOrder.ASC,
        processID,
      } = teamFilterInput;
      let whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      if (processID) {
        whereClause.processID = processID;
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
        whereClause.orgID = user.orgID;
      }
      const team = await this.teamModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,
        include: [
          {
            model: Process,
            as: 'process',
            attributes: ['id', 'name'],
          },
        ],
      });
      return {
        totalItems: team.count,
        items: team.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findAllTeamAnnouncement(
    teamID: string,
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
        teamID, // only this team's announcements — org-wide ones excluded here
      };
      if (status) {
        whereClause['status'] = status;
      }

      const announcements = await this.announcementModel.findAndCountAll({
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
        totalItems: announcements.count,
        items: announcements.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getActiveTeamAnnouncement(
    teamID: string,
    user: any,
  ): Promise<Announcement> {
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      // Expire stale team announcements, same pattern as org-level
      await this.announcementModel.update(
        { status: Status.Inactive },
        {
          where: {
            status: Status.Active,
            endDate: { [Op.lt]: now },
            orgID: user.orgID,
            teamID,
          },
        },
      );

      const announcement = await this.announcementModel.findOne({
        where: {
          status: Status.Active,
          endDate: { [Op.gte]: now },
          orgID: user.orgID,
          teamID,
        },
        order: [['endDate', 'ASC']],
      });

      return announcement ?? null;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: string, user: any): Promise<GenericResponse<Team>> {
    try {
      const whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.id = id;
      const team = await this.teamModel.findOne({
        where: whereClause,
        include: [
          {
            model: Process,
            as: 'process',
            attributes: ['id', 'name'],
          },
        ],
      });
      if (team)
        return {
          message: 'Team found',
          data: team,
        };
      else throw new NotFoundException('Invalid Team id');
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateTeamInput: UpdateTeamInput,
    user: any,
  ): Promise<any> {
    try {
      const teamById = await this.findOne(id, user);
      if (updateTeamInput.isShiftEnabled === false) {
        updateTeamInput.shiftLoginTime = null;
        updateTeamInput.shiftLogoutTime = null;
        updateTeamInput.workHours = null;
        updateTeamInput.isAutoLogoutEnabled = false;
      }
      if (updateTeamInput.isAutoLogoutEnabled === false) {
        updateTeamInput.workHours = null;
      }
      const validationErrors = await uniqueFieldsCheck(
        this.teamModel,
        ['name'],
        updateTeamInput,
        id,
        user?.orgID,
      );
      handleErrors(validationErrors, 'unique');
      const team = await this.teamModel.update(updateTeamInput, {
        where: { id },
        returning: true,
      });
      const eventPayload = JSON.parse(JSON.stringify(updateTeamInput));
      const eventLog = {
        objectType: 'Team',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: teamById.data,
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return {
        status: true,
        message: 'Team updated successfully',
        data: team?.[1]?.[0],
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async findProcess(id: string): Promise<Team> {
    const process = await this.teamModel.findOne({
      where: {
        processID: id,
      },
    });
    return process;
  }
  async softDelete(id: string, user: any): Promise<GenericResponse<null>> {
    try {
      const assignedEmployeeCount = await this.employeeModel.count({
        where: { teamID: id, orgID: user.orgID },
      });

      if (assignedEmployeeCount > 0) {
        throw new BadRequestException(
          `Cannot delete team as employees are assigned to this team.`,
        );
      }
      const response = await this.teamModel.destroy({
        where: {
          id,
        },
      });
      if (response !== 0) {
        const eventLog = {
          objectType: 'Team',
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
        return {
          message: 'Team deleted successfully',
          data: null,
        };
      } else throw new NotFoundException(`Team not found`);
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
