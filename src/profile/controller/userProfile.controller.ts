import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from 'node_modules/@nestjs/platform-express';
import { ApiBody, ApiBearerAuth, ApiTags } from 'node_modules/@nestjs/swagger';

import { ProfileService } from '../service/profile.service';
import { Profile } from '../model/profile.model';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { UpdateProfileInput } from '../dtos/update-profile-input.dto';
import { Employee } from 'src/employee/models/employee.model';
import { EmployeeService } from 'src/employee/services/employee-service';
import { VendorUser } from 'src/vendor-management/vendor-user/models/vendor-user.model';
import { VendorUserService } from 'src/vendor-management/vendor-user/services/vendor-user.service';
import { AuthService } from 'src/auth/services/auth.service';
import { Authentication } from 'src/auth/models/authentication.model';
// import { RateLimit } from '../guards/rate-limit.decorator';

import {
  imageFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';
import { SetSecurityPinDto } from '../dtos/set-security-pin-input.dto';
import { VerifyPinResetOtpDto } from '../dtos/verify-reset-pin-input.dto';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('user-profile')
@ApiTags('User-Profile')
export class UserProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
    private readonly employeeService: EmployeeService,
    private readonly vendorUserService: VendorUserService,
  ) {}

  @Get('/user')
  async findCurrentUser(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Employee>> {
    const result = await this.employeeService.findOne(user.employeeID, user);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['profileInput.image']),
    };
  }

  @Get('/vendor')
  async findCurrentVendor(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<VendorUser>> {
    const result = await this.vendorUserService.findOne(user.vendorUserID);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['image']),
    };
  }

  @Put('updateProfile')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: imageFileFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async updateUserProfile(
    @CurrentUser() user: any,
    @Body() updateProfileInput: UpdateProfileInput,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<GenericResponse<Profile>> {
    if (file) validateUploadedFile(file, 'image');
    return await this.profileService.updateUserProfile(
      user,
      updateProfileInput,
      file,
    );
  }

  @Put('vendorProfile')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: imageFileFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  async updateVendorProfile(
    @CurrentUser() user: any,
    @Body() updateProfileInput: UpdateProfileInput,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<GenericResponse<Profile>> {
    if (file) validateUploadedFile(file, 'image');
    return await this.profileService.updateVendorProfile(
      user,
      updateProfileInput,
      file,
    );
  }

  @Put('guest-employee/:employeeID')
  async updateGuestEmployee(
    @Param('employeeID') employeeID: bigint,
    @Body() updateEmployeeData: any,
  ): Promise<GenericResponse<Profile>> {
    return await this.profileService.updateGuestEmployee(
      employeeID,
      updateEmployeeData,
    );
  }

  @Put('updateApprovalRequest')
  async cancelProfileUpdateRequest(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<any>> {
    return await this.profileService.cancelProfileUpdateRequest(user);
  }

  @Post('reset-password')
  async employeeResetPassword(
    @Body() newPassword: any,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Authentication>> {
    return await this.authService.resetEmployeePassword(
      user.id,
      newPassword.newPassword,
    );
  }

  @Post('change-homePoint')
  async employeeChangeHomePoint(
    @Body() body: { homePoint: string },
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Authentication>> {
    return await this.employeeService.employeeChangeHomePoint(
      user,
      body.homePoint,
    );
  }

  @ApiBody({
    description: 'Set and reset security PIN',
    type: SetSecurityPinDto,
  })
  @ApiBearerAuth('access-token')
  @Put('set-securityPin')
  async setSecurityPin(
    @Body() securityPinDto: SetSecurityPinDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Profile>> {
    return await this.employeeService.setSecurityPin(user, securityPinDto);
  }

  @Get(':empID')
  // @UseGuards(PermissionGuard('Profile-Read'))
  async findOneProfileForEmpID(
    @Param('empID') empID: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Profile>> {
    const result = await this.profileService.findOneProfileForEmpID(empID);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['image']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Profile',
      ),
    };
  }

  // @ApiBody({
  //   description: 'Send the otp for resetting the security PIN',
  //   // type: VerifyPinResetOtpDto,
  // })
  @ApiBearerAuth('access-token')
  @Post('send-pin-reset-otp')
  async sendPinResetOtp(
    @CurrentUser() user: any,
  ): Promise<GenericResponse<any>> {
    return this.profileService.sendPinResetOtp(user);
  }

  @ApiBody({
    description: 'Verify the otp for resetting the security PIN',
    type: VerifyPinResetOtpDto,
  })
  @ApiBearerAuth('access-token')
  @Put('verify-pin-reset-otp')
  async verifyPinResetOtp(
    @CurrentUser() user: any,
    @Body() body: VerifyPinResetOtpDto,
  ) {
    return await this.profileService.verifyPinResetOtp(user, body.otp);
  }
}
