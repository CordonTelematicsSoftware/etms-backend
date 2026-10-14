import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { CompanyConfiguration } from './models/company-config.model';
import { CompanyConfigService } from './services/company-config.service';

@Module({
  imports: [SequelizeModule.forFeature([CompanyConfiguration])],
  exports: [CompanyConfigService],
  providers: [CompanyConfigService],
  controllers: [],
})
export class CompanyConfigModule {}
