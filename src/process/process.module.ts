import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Process } from './models/process.model';
import { ProcessController } from './controllers/process.controller';
import { ProcessService } from './services/process.service';
import { TeamModule } from 'src/team/team.module';

@Module({
  imports: [SequelizeModule.forFeature([Process]), TeamModule],
  controllers: [ProcessController],
  providers: [ProcessService],
  exports: [ProcessService],
})
export class ProcessModule {}
