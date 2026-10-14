import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Costcenter } from './model/costcenter.model';
import { CostcenterController } from './controller/costcenter.controller';
import { CostcenterService } from './service/costcenter.service';

@Module({
  imports: [SequelizeModule.forFeature([Costcenter]), CostcenterModule],
  controllers: [CostcenterController],
  providers: [CostcenterService],
  exports: [CostcenterService],
})
export class CostcenterModule {}
