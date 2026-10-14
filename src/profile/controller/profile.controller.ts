import {
  Controller,
  Get,
  Param,
  UseGuards,
  // Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ProfileService } from '../service/profile.service';
import { Profile } from '../model/profile.model';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('admin/profile')
@ApiTags('Profile')
@ApiBearerAuth('access-token')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(':id')
  @UseGuards(PermissionGuard('Profile-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Profile>> {
    const result = await this.profileService.findOne(id);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['image']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Profile',
      ),
    };
  }
}
