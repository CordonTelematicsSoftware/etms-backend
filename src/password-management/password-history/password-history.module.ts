import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PasswordHistory } from './models/password-history.model';
import { PasswordHistoryService } from './services/password-history.service';

@Module({
  imports: [SequelizeModule.forFeature([PasswordHistory])],
  providers: [PasswordHistoryService],
  exports: [PasswordHistoryService],
})
export class PasswordHistoryModule {}
