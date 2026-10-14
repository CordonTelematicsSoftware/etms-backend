// ============================================================
// location.controller.ts
// ============================================================
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
import { Location } from '../models/location.model';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UpdateLocationInput } from '../dtos/update-location-input.dto';
import { LocationService } from '../services/location.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CreateLocationInput } from '../dtos/create-location-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { LocationFilterInput } from '../dtos/location-filter-input.dto';
import { FileInterceptor } from 'node_modules/@nestjs/platform-express';
import {
  excelFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';

@Controller('admin/location')
@ApiTags('Location')
@ApiBearerAuth('access-token')
export class LocationController {
  private logger = new Logger(LocationController.name);
  constructor(private readonly locationService: LocationService) {}

  @Post()
  @UseGuards(PermissionGuard('Zone-Create'))
  async create(
    @Body() createLocationInput: CreateLocationInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Location>> {
    return this.locationService.create(createLocationInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Zone-Read'))
  async findAll(
    @Query() locationFilterInput: LocationFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Location>> {
    return {
      ...(await this.locationService.findAll(locationFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Zone',
      ),
    };
  }

  @Get('/zones-employees-by-distance')
  @UseGuards(PermissionGuard('Zone-Read'))
  async findZonesWithEmployeeDistance(
    @CurrentUser() user: any,
  ): Promise<Location[]> {
    return await this.locationService.findZonesWithEmployeeWithDistance(user);
  }

  @Get('/zones-employees')
  @UseGuards(PermissionGuard('Zone-Read'))
  async findZonesWithEmployee(@CurrentUser() user: any): Promise<Location[]> {
    return await this.locationService.findZonesWithEmployee(user);
  }

  @Get('/getAllZones')
  @UseGuards(PermissionGuard('Zone-Read'))
  async getAllZones(
    @CurrentUser() user: any,
    @Query() locationFilterInput: LocationFilterInput,
  ): Promise<PaginatedList<Location>> {
    return await this.locationService.getAllZones(locationFilterInput, user);
  }

  @Get('/getZonesforEmployees')
  @UseGuards(PermissionGuard('Zone-Read'))
  async getAllZonesForEmployees(
    @CurrentUser() user: any,
    @Query() locationFilterInput: LocationFilterInput,
  ): Promise<PaginatedList<Location>> {
    return await this.locationService.getAllZonesForEmployees(
      locationFilterInput,
      user,
    );
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Zone-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Location>> {
    return await this.locationService.findOne(id, user);
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Zone-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateLocationInput: UpdateLocationInput,
  ): Promise<GenericResponse<Location>> {
    return {
      ...(await this.locationService.update(id, updateLocationInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Zone',
      ),
    };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Zone-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return {
      ...(await this.locationService.softDelete(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Zone',
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
    return await this.locationService.importZones(file.buffer, user);
  }
}
