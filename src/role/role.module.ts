import { Module, forwardRef } from '@nestjs/common';
import { RoleController } from './controller/admin.role.controller';
import { RoleService } from './service/role.service';
import { Role } from './models/role.model';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Role]),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
  ],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
})
export class RoleModule {}
