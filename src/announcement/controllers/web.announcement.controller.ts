import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AnnouncementService } from '../services/announcement.service';
import { CreateAnnouncementInput } from '../dtos/create-announcement-input.dto';
import { Announcement } from '../models/announcement.model';
import { AnnouncementFilterInput } from '../dtos/announcement-filter-input-dto';
import { UpdateAnnouncementInput } from '../dtos/update-announcement-input.dto';

@Controller('admin/announcement')
@ApiTags('Announcement')
@ApiBearerAuth('access-token')
export class WebAnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Post()
  @UseGuards(PermissionGuard('Announcement-Create'))
  async create(
    @Body() createAnnouncementInput: CreateAnnouncementInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Announcement>> {
    return this.announcementService.create(createAnnouncementInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Announcement-Read'))
  async findAll(
    @Query() announcementFilterInput: AnnouncementFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Announcement>> {
    return {
      ...(await this.announcementService.findAll(
        announcementFilterInput,
        user,
      )),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Announcement',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Announcement-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Announcement>> {
    return {
      ...(await this.announcementService.findOne(id)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Announcement',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Announcement-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateAnnouncementInput: UpdateAnnouncementInput,
  ): Promise<GenericResponse<Announcement>> {
    return this.announcementService.update(id, updateAnnouncementInput, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Announcement-Delete'))
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.announcementService.delete(id, user);
  }
}
