import * as bcrypt from 'bcryptjs';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models/user.model';
import { JsonWebTokenService } from 'src/shared/utils/jwt';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { EmailService } from 'src/email/email.service';
import { CreateUserInput } from '../dtos/create-user-input.dto';
import { AdministratorService } from 'src/administrator/services/administrator.service';
import { UpdateUserInput } from '../dtos/update-user-input.dto';
import { Transaction } from 'sequelize';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

import {
  ForgotPasswordInput,
  ResetPasswordInput,
} from '../dtos/password-input.dto';
import { UpdatePasswordInput } from '../dtos/forgot-password.input';
import { UserType } from 'src/shared/enums';
import { RoleService } from 'src/role/service/role.service';
import { SessionService } from 'src/auth/services/session.service';

@Injectable()
export class UserService {
  private logger = new Logger(UserService.name);
  constructor(
    @InjectModel(User)
    private userModel: typeof User,
    @Inject(forwardRef(() => JsonWebTokenService))
    private jsonWebTokenService: JsonWebTokenService,
    @Inject(forwardRef(() => AdministratorService))
    private adminService: AdministratorService,
    @Inject(forwardRef(() => SessionService))
    private sessionService: SessionService,
    @Inject(forwardRef(() => RoleService))
    private roleService: RoleService,
    private emailService: EmailService,
    private readonly mailerService: MailerService,
    private configService: ConfigService,
  ) {}
  //----------- create device token from mobile app----------

  async saveUsertoken(
    currentUser: User,
    deviceToken?: string,
  ): Promise<GenericResponse<null>> {
    //check token exist against user
    let userToken = await this.userModel.findOne({
      where: {
        userId: currentUser.id,
      },
    });
    if (!deviceToken) {
      userToken = await this.userModel.create({
        userId: currentUser.id,
        deviceToken: deviceToken,
      });
    } else {
      userToken.deviceToken = deviceToken;
      userToken.save();
    }
    return {
      status: true,
      message: 'token created',
    };
  }
  // ------------------------------------------------
  async create(
    createUserInput: CreateUserInput,
    hashedPassword?: string,
    transaction?: Transaction,
  ): Promise<User> {
    try {
      const permissions = createUserInput.roleID
        ? await this.getRolePermissions(createUserInput.roleID)
        : [];
      const userInput = { ...createUserInput, hashedPassword, permissions };

      const user = await this.userModel.create(userInput, {
        transaction,
      });

      Object.assign(userInput, {
        userID: user?.id.toString(),
      });

      return user;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async generateHashedPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return await bcrypt.hash(password, salt);
  }

  async softDelete(id: bigint): Promise<void> {
    try {
      await this.userModel.destroy({ where: { id } });
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  isRoleChanged = (user, input): boolean => {
    if (user.roleId !== input.roleId) {
      return true;
    } else {
      return false;
    }
  };

  async update(
    id: string,
    updateUserInput: UpdateUserInput,
    transaction?: Transaction,
    userType?: UserType.Admin | UserType.SuperAdmin | UserType.Member,
  ): Promise<boolean> {
    try {
      const user = await this.userModel.findOne({ where: { id } });
      if (!user) {
        if (userType !== UserType.Member) {
          throw new NotFoundException('User not found');
        }
        return true;
      }
      const isRoleUpdated =
        user.userType === UserType.Admin
          ? this.isRoleChanged(user, updateUserInput)
          : false;
      if (isRoleUpdated) {
        updateUserInput.permissions = updateUserInput.roleID
          ? await this.getRolePermissions(updateUserInput.roleID)
          : null;
      }
      if (isRoleUpdated) {
        this.sessionService.invalidate(id);
      }
      await this.userModel.update(updateUserInput, {
        where: { id },
        returning: true,
        transaction,
      });
      // Only invalidate session if phone or email was changed
      const phoneChanged =
        updateUserInput.phone && updateUserInput.phone !== user?.phone;
      const emailChanged =
        updateUserInput.email && updateUserInput.email !== user?.email;
      if (phoneChanged || emailChanged) {
        this.sessionService.invalidate(id);
      }
      return true;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async updatePermissions(id: string, permissions: string[]): Promise<User> {
    try {
      const user = await this.userModel.findOne({ where: { id } });
      await user.update({ permissions });
      await this.sessionService.invalidate(id);
      return user;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async updatePassword(
    currentUser: User,
    resetPasswordInput: ResetPasswordInput,
  ): Promise<any> {
    try {
      const user = await this.userModel.findOne({
        where: { id: currentUser.id },
      });
      if (!user) {
        throw new Error('User not found');
      }
      const { newPassword } = resetPasswordInput;
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      const result = await bcrypt.compare(
        resetPasswordInput.oldPassword,
        user.hashedPassword,
      );
      if (!result) {
        throw new BadRequestException('Old password entered is incorrect');
      }
      await user.update({ hashedPassword: hashedPassword });
      return {
        message: 'Password Updated',
        data: user,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getUserByEmail(email: string): Promise<User> {
    const user = await this.userModel.findOne({
      where: { email },
    });
    if (user) {
      return user;
    } else {
      throw new BadRequestException(
        'Account not found. Check your email address',
      );
    }
  }

  async sendForgotPasswordLink(email: string): Promise<void> {
    const accessToken = await this.jsonWebTokenService.generateToken(
      { email },
      parseInt(this.configService.get('JWT_EXPIRY_IN_SECONDS'), 10),
    );

    const url = `${process.env.MAIL_VERIFY_URL}reset-password?token=${accessToken}`;

    await this.mailerService.sendMail({
      to: email,
      from: `${this.configService.get('FROM_MAIL')}`,
      subject: 'Password Reset',
      template: 'password-reset',
      context: {
        link: url,
      },
    });
  }

  async sendPasswordResetLink(
    forgotPasswordInput: ForgotPasswordInput,
  ): Promise<any> {
    try {
      const { email } = forgotPasswordInput;
      await this.getUserByEmail(email);
      await this.sendForgotPasswordLink(email);
      return {
        status: true,
        message: 'The password reset link has been sent to your email address',
        data: '',
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async findMemberWithRole(id: string): Promise<boolean> {
  //   try {
  //     const isRoleAssignedUser = await this.adminService.findUserWithRole(id);
  //     const isRoleAssignedMember = await this.memberService.findMemberWithRole(
  //       id,
  //     );
  //     if (isRoleAssignedUser || isRoleAssignedMember) {
  //       return true;
  //     } else {
  //       return false;
  //     }
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async forgotResetPassword(updatePasswordInput: UpdatePasswordInput) {
    try {
      const { token } = updatePasswordInput;
      const payload = await this.jsonWebTokenService.verifyToken(token);

      if (typeof payload === 'object' && 'email' in payload) {
        const user = await this.getUserByEmail(payload.email);
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(
          updatePasswordInput.newPassword,
          salt,
        );
        await user.update({
          hashedPassword,
        });
        return { message: 'Password Reset successful', status: true };
      } else {
        throw new BadRequestException('Bad confirmation token.');
      }
    } catch (error) {
      if (error?.name === 'TokenExpiredError') {
        throw new BadRequestException('Your reset link expired.');
      }
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * FoR First Time Login. Will check if member exist, if yes, will create a new use
   * @param phone
   * @returns
   */
  // async findMemberAndCreateUser(phone: string): Promise<User> {
  //   try {
  //     const member = await this.memberService.findByPhone(phone);
  //     if (!member) {
  //       return null;
  //     }
  //     const user = await this.userModel.create({
  //       phone,
  //       email: member?.email,
  //       userType: UserType.Member,
  //     });
  //     member.userID = user.id.toString();
  //     await member.save();
  //     return user;
  //   } catch (error) {
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async getRolePermissions(roleId: string): Promise<string[]> {
    const roleDetails = await this.roleService.getRoleById(roleId);
    const permissions = roleDetails?.data?.permissions || [];
    return permissions;
  }

  //check if role assigned to any User
  async findUserWithRole(id: string): Promise<boolean> {
    try {
      const user = await this.userModel.findOne({
        where: {
          roleID: id,
        },
      });
      if (user) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
