import { Module, forwardRef } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AdministratorService } from './services/administrator.service';
import { Administrator } from './models/administrator.model';
import { UserModule } from 'src/user/user.module';
import { AdministratorController } from './controllers/admin.administrator.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([Administrator]),
    forwardRef(() => UserModule),
  ],
  controllers: [AdministratorController],
  providers: [AdministratorService],
  exports: [AdministratorService],
})
export class AdministratorModule {}
