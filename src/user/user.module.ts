import { Module, forwardRef } from '@nestjs/common';
import { User } from './models/user.model';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserService } from './services/user.service';
import { EmailModule } from 'src/email/email.module';
import { AuthModule } from 'src/auth/auth.module';
import { UserController } from './controllers/user.controller';
import { AdministratorModule } from 'src/administrator/administrator.module';
import { RoleModule } from 'src/role/role.module';

@Module({
  imports: [
    SequelizeModule.forFeature([User]),
    EmailModule,

    forwardRef(() => AuthModule),
    forwardRef(() => AdministratorModule),
    RoleModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
