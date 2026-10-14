import { Module } from '@nestjs/common';
import { SecurityController } from './controller/security.controller';
import { SecurityService } from './service/security.service';
import { SequelizeModule } from 'node_modules/@nestjs/sequelize';
import { Security } from './models/security.model';

@Module({
  imports: [SequelizeModule.forFeature([Security])],
  controllers: [SecurityController],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
