import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AnnouncementService } from '../services/announcement.service';
import { Announcement } from '../models/announcement.model';
import { TeamService } from 'src/team/services/team.service';

@Controller('mobile/announcement')
@ApiTags('Announcement')
@ApiBearerAuth('access-token')
export class MobileAnnouncementController {
  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly teamService: TeamService,
  ) {}

  @Get()
  // @UseGuards(PermissionGuard('Announcement-Read'))
  async getActiveAnnouncement(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Announcement[]>> {
    const announcement = await this.announcementService.getActiveAnnouncement(
      user,
    );
    return {
      message: 'Active announcement fetched successfully',
      data: announcement,
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Announcement',
      ),
    };
  }

  // old api
  //   @Get()
  // @UseGuards(PermissionGuard('Announcement-Read'))
  // async getActiveAnnouncement(
  //   @CurrentUser() user: any,
  // ): Promise<GenericResponse<Announcement>> {
  //   const announcement = await this.announcementService.getActiveAnnouncement(
  //     user,
  //   );
  //   return {
  //     message: 'Active announcement fetched successfully',
  //     data: announcement,
  //     entityPermissions: user?.role?.permissions?.filter(
  //       (permission) => permission?.split('-')?.[0] === 'Announcement',
  //     ),
  //   };
  // }
}
