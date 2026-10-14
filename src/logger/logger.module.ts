import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { LoggerService } from './logger.service';
import { Log } from 'src/logger/models/log.model';
import { LoggerController } from './logger.controller';

@Module({
  imports: [SequelizeModule.forFeature([Log])],
  controllers: [LoggerController],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
