import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
  UseGuards,
  BadRequestException,
  UploadedFile,
  Logger,
  UseInterceptors,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { SecurityService } from '../service/security.service';
import { CreateSecurityInput } from '../dtos/create-security-input.dto';
import { Security } from '../models/security.model';
import { SecurityFilterInput } from '../dtos/security-filter-input.dto';
import { UpdateSecurityInput } from '../dtos/update-security-input.dto';
import {
  excelFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';

import { UserType } from 'src/shared/enums';
@Controller('admin/security')
@ApiTags('Security')
@ApiBearerAuth('access-token')
export class SecurityController {
  private logger = new Logger(SecurityController.name);

  constructor(private readonly securityService: SecurityService) {}

  @Post()
  @UseGuards(PermissionGuard('Security-Create'))
  async create(
    @Body() createSecurityInput: CreateSecurityInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Security>> {
    return this.securityService.create(createSecurityInput, user);
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: excelFileFilter,
      // limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @UseGuards(PermissionGuard('Security-Create'))
  async importSecurities(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<object> {
    if (!file) {
      throw new BadRequestException('File is required.');
    }
    validateUploadedFile(file, 'excel');
    this.logger.log('Security bulk upload file received', file.originalname);
    return await this.securityService.importSecurities(file.buffer, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Security-Read'))
  async findAll(
    @Query() securityFilterInput: SecurityFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Security>> {
    return {
      ...(await this.securityService.findAll(securityFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Security',
      ),
    };
  }

  @Get('list')
  @UseGuards(PermissionGuard('Report-Read'))
  async securityListForReport(
    @Query() securityFilterInput: SecurityFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Security>> {
    return {
      ...(await this.securityService.findAll(securityFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report',
      ),
    };
  }

  @Get('security-list-dashboard')
  @UseGuards(PermissionGuard('Dashboard-Read'))
  async findAllSecurity(
    @Query() securityFilterInput: SecurityFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Security>> {
    return {
      ...(await this.securityService.findAll(securityFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Dashboard',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Security-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Security>> {
    return {
      ...(await this.securityService.findOne(id)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Security',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Security-Update'))
  async update(
    @Param('id') id: string,
    @Body() updateSecurityInput: UpdateSecurityInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Security>> {
    return this.securityService.update(id, updateSecurityInput, user);
  }

  @Delete(':id')
  @UseGuards(
    new (class implements CanActivate {
      canActivate(context: ExecutionContext): boolean {
        const { user } = context.switchToHttp().getRequest();
        if (!user) return false;
        return user.userType === UserType.SuperAdmin;
      }
    })(),
  )
  async softDelete(
    @Param('id') id: bigint,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.securityService.softDelete(id, user);
  }
}
