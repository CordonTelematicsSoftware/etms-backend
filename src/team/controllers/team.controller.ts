import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Put,
  Delete,
} from '@nestjs/common';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Team } from '../models/team.model';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdateTeamInput } from '../dtos/update-team-input.dto';
import { TeamService } from '../services/team.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CreateTeamInput } from '../dtos/create-team-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { TeamFilterInput } from '../dtos/team-filter-input.dto';
import { AnnouncementFilterInput } from 'src/announcement/dtos/announcement-filter-input-dto';
import { CreateAnnouncementInput } from 'src/announcement/dtos/create-announcement-input.dto';
import { AnnouncementService } from 'src/announcement/services/announcement.service';
import { Announcement } from 'src/announcement/models/announcement.model';
import { UpdateAnnouncementInput } from 'src/announcement/dtos/update-announcement-input.dto';

@Controller('admin/team')
@ApiTags('Team')
@ApiBearerAuth('access-token')
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly announcementService: AnnouncementService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard('Team-Create'))
  async create(
    @Body() createTeamInput: CreateTeamInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Team>> {
    return this.teamService.create(createTeamInput, user);
  }

  @Post(':teamID/announcement')
  @UseGuards(PermissionGuard('Team-Create'))
  async createAnnouncement(
    @Param('teamID') teamID: string,
    @Body() createAnnouncementInput: CreateAnnouncementInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Announcement>> {
    // teamID always comes from the route, never from the body
    createAnnouncementInput.teamID = teamID;

    return this.announcementService.create(createAnnouncementInput, user);
  }

  @Put(':teamID/announcement/:id')
  @UseGuards(PermissionGuard('Team-Update'))
  async updateAnnouncement(
    @Param('teamID') teamID: string,
    @Param('id') id: string,
    @Body() updateAnnouncementInput: UpdateAnnouncementInput,
    @CurrentUser() user: any,
  ): Promise<any> {
    return this.announcementService.update(
      id,
      updateAnnouncementInput,
      user,
      teamID, // used to scope the update, see service change below
    );
  }

  @Get()
  @UseGuards(PermissionGuard('Team-Read'))
  async findAll(
    @Query() teamFilterInput: TeamFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Team>> {
    return {
      ...(await this.teamService.findAll(teamFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Team',
      ),
    };
  }

  @Get(':id/announcement')
  @UseGuards(PermissionGuard('Team-Read'))
  async findAllTeamAnnouncement(
    @Param('id') id: string,
    @Query() announcementFilterInput: AnnouncementFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Announcement>> {
    return {
      ...(await this.teamService.findAllTeamAnnouncement(
        id,
        announcementFilterInput,
        user,
      )),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Team',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Team-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Team>> {
    return {
      ...(await this.teamService.findOne(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Team',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Team-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateTeamInput: UpdateTeamInput,
  ): Promise<GenericResponse<Team>> {
    return {
      ...(await this.teamService.update(id, updateTeamInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Team',
      ),
    };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Team-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return {
      ...(await this.teamService.softDelete(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Team',
      ),
    };
  }
}
