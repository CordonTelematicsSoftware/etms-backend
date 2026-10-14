import { Module } from '@nestjs/common';
import { SettingsService } from '../settings.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Settings } from '../models/settings.model';

@Module({
  imports: [SequelizeModule.forFeature([Settings])],

  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
