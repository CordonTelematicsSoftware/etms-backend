import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Team } from './models/team.model';
import { TeamController } from './controllers/team.controller';
import { TeamService } from './services/team.service';
import { Employee } from 'src/employee/models/employee.model';
import { Announcement } from 'src/announcement/models/announcement.model';
import { AnnouncementModule } from 'src/announcement/announcement.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Team, Employee, Announcement]),
    forwardRef(() => AnnouncementModule),
    // TeamModule
  ],

  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
