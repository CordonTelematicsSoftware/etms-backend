import { forwardRef, Module } from '@nestjs/common';
import { Announcement } from './models/announcement.model';
import { SequelizeModule } from 'node_modules/@nestjs/sequelize';
import { AnnouncementService } from './services/announcement.service';
import { WebAnnouncementController } from './controllers/web.announcement.controller';
import { MobileAnnouncementController } from './controllers/mobile.announcement.controller';
import { Team } from 'src/team/models/team.model';
import { TeamModule } from 'src/team/team.module';
import { Employee } from 'src/employee/models/employee.model';

@Module({
  imports: [
    SequelizeModule.forFeature([Announcement, Team, Employee]),
    forwardRef(() => TeamModule),
  ],
  controllers: [WebAnnouncementController, MobileAnnouncementController],
  providers: [AnnouncementService],
  exports: [AnnouncementService],
})
export class AnnouncementModule {}
