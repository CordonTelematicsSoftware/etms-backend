import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { RouteService } from '../services/route.service';
import { CreateRouteInput } from '../dtos/create-route-input-dto';
import { Route } from '../models/route.model';
import { RouteFilterInput } from '../dtos/route-filter-input-dto';
import { UpdateRouteInput } from '../dtos/update-route-input-dto';
import { FileInterceptor } from 'node_modules/@nestjs/platform-express';
import {
  excelFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';

@Controller('admin/route')
@ApiTags('Route')
@ApiBearerAuth('access-token')
export class RouteController {
  logger: any;
  constructor(private readonly routeService: RouteService) {}

  @Post()
  @UseGuards(PermissionGuard('Routes-Create'))
  async create(
    @Body() createRouteInput: CreateRouteInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Route>> {
    return this.routeService.create(createRouteInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Routes-Read'))
  async findAll(
    @Query() routeFilterInput: RouteFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Route>> {
    return {
      ...(await this.routeService.findAll(routeFilterInput, user)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Routes',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Routes-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Route>> {
    return {
      ...(await this.routeService.findOne(id)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Route',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Routes-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateRouteInput: UpdateRouteInput,
  ): Promise<GenericResponse<Route>> {
    return this.routeService.update(id, updateRouteInput, user);
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: excelFileFilter,
      // limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importRoutes(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<object> {
    if (!file) {
      throw new BadRequestException('File is required.');
    }
    validateUploadedFile(file, 'excel');
    return this.routeService.importRoutes(file.buffer, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Routes-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.routeService.delete(id, user);
  }
}
