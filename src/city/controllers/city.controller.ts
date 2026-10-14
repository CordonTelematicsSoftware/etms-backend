import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CityService } from '../services/city.service';
import { CreateCityInput } from '../dtos/create-city-input-dto';
import { City } from '../models/city.model';
import { CityFilterInput } from '../dtos/city-filter-input-dto';
import { UpdateCityInput } from '../dtos/update-city-input-dto';

@Controller('admin/city')
@ApiTags('City')
@ApiBearerAuth('access-token')
export class CityController {
  constructor(private readonly cityService: CityService) {}

  @Post()
  @UseGuards(PermissionGuard('City-Create'))
  async create(
    @Body() createCityInput: CreateCityInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<City>> {
    return this.cityService.create(createCityInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('City-Read'))
  async findAll(
    @Query() cityFilterInput: CityFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<City>> {
    return {
      ...(await this.cityService.findAll(cityFilterInput)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'City',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('City-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<City>> {
    return {
      ...(await this.cityService.findOne(id)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'City',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('City-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateCityInput: UpdateCityInput,
  ): Promise<GenericResponse<City>> {
    return this.cityService.update(id, updateCityInput, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('City-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.cityService.delete(id, user);
  }
}
