import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Put,
  Delete,
  UseInterceptors,
  BadRequestException,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { CommonPoint } from '../models/commonPoint.model';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UpdateCommonPointInput } from '../dtos/update-commonpoint.input.dto';
import { CommonPointService } from '../services/commonPoint.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CreateCommonPointInput } from '../dtos/create-commonPoint-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CommonPointFilterInput } from '../dtos/commonPoint-filter-input.dto';
import { FileInterceptor } from 'node_modules/@nestjs/platform-express';
import {
  excelFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';

@Controller('admin/commonpoint')
@ApiTags('CommonPoint')
@ApiBearerAuth('access-token')
export class CommonPointController {
  private logger = new Logger(CommonPointController.name);
  constructor(private readonly commonpointService: CommonPointService) {}

  @Post()
  @UseGuards(PermissionGuard('Common Point-Create'))
  async create(
    @Body() createCommonPointInput: CreateCommonPointInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<CommonPoint>> {
    return this.commonpointService.create(createCommonPointInput, user);
  }

  @Get('findAllActiveCommonPoints')
  @UseGuards(PermissionGuard('Common Point-Read'))
  async findAllActiveCommonPoints(
    @Query() commonpointFilterInput: CommonPointFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<CommonPoint>> {
    return {
      ...(await this.commonpointService.findAllActiveCommonPoints(
        commonpointFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Common Point',
      ),
    };
  }

  @Get('findAllCommonPoints')
  @UseGuards(PermissionGuard('Common Point-Read'))
  async findAllCommonPoints(
    @CurrentUser() user: any,
  ): Promise<PaginatedList<CommonPoint>> {
    return {
      ...(await this.commonpointService.findAllCommonPoints(user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Common Point',
      ),
    };
  }

  @Get()
  @UseGuards(PermissionGuard('Common Point-Read'))
  async findAll(
    @Query() commonpointFilterInput: CommonPointFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<CommonPoint>> {
    return {
      ...(await this.commonpointService.findAll(commonpointFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Common Point',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Common Point-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<CommonPoint>> {
    return {
      ...(await this.commonpointService.findOne(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Common Point',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Common Point-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateCommonPointInput: UpdateCommonPointInput,
  ): Promise<GenericResponse<CommonPoint>> {
    return {
      ...(await this.commonpointService.update(
        id,
        updateCommonPointInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Common Point',
      ),
    };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Common Point-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return {
      ...(await this.commonpointService.softDelete(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Common Point',
      ),
    };
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: excelFileFilter,
      // limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importEmployees(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<object> {
    if (!file) {
      throw new BadRequestException('File is required.');
    }
    validateUploadedFile(file, 'excel');
    this.logger.log('file---', file);
    return await this.commonpointService.importCommonPoints(file.buffer, user);
  }
}
