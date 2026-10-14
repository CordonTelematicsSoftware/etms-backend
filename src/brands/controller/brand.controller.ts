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
import { BrandService } from '../service/brand.service';
import { CreateBrandInput } from '../dtos/create-brand-input-dto';
import { Brand } from '../models/brand.model';
import { BrandFilterInput } from '../dtos/brand-filter-input.-dto';
import { UpdateBrandInput } from '../dtos/update-brand-input-dto';

@Controller('admin/brand')
@ApiTags('Brand')
@ApiBearerAuth('access-token')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post()
  @UseGuards(PermissionGuard('Brand-Create'))
  async create(
    @Body() createBrandInput: CreateBrandInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Brand>> {
    return this.brandService.create(createBrandInput, user);
  }

  @Get('active-brands')
  @UseGuards(PermissionGuard('Brand-Read'))
  async findAllActiveBrands(
    @Query() brandFilterInput: BrandFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Brand>> {
    return {
      ...(await this.brandService.findAllActiveBrands(brandFilterInput)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Brand',
      ),
    };
  }

  @Get()
  @UseGuards(PermissionGuard('Brand-Read'))
  async findAll(
    @Query() brandFilterInput: BrandFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Brand>> {
    return {
      ...(await this.brandService.findAll(brandFilterInput)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Brand',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Brand-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Brand>> {
    return {
      ...(await this.brandService.findOne(id)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Brand',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Brand-Update'))
  async update(
    @Param('id') id: string,
    @Body() updateBrandInput: UpdateBrandInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Brand>> {
    return this.brandService.update(id, updateBrandInput, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Brand-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.brandService.delete(id, user);
  }
}
