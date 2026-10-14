import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Brand } from './models/brand.model';
import { BrandController } from './controller/brand.controller';
import { BrandService } from './service/brand.service';
import { CabModule } from 'src/cabs/cab.module';
@Module({
  imports: [SequelizeModule.forFeature([Brand]), CabModule],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
