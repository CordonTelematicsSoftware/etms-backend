import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { GmsCategory } from './models/gms-category.model';
import { GmsCategoryService } from './services/gms-category.service';
import { GmsCategoryController } from './controllers/gms-category.controller';
import { GrievanceModule } from 'src/grievance/grievance.module';

@Module({
  imports: [
    SequelizeModule.forFeature([GmsCategory]),
    forwardRef(() => GrievanceModule),
  ],
  providers: [GmsCategoryService],
  exports: [GmsCategoryService],
  controllers: [GmsCategoryController],
})
export class GmsCategoryModule {}
