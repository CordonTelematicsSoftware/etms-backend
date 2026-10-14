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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

import { CreateGmsCategoryInput } from '../dtos/create-gms-category-input.dto';
import { GmsCategory } from '../models/gms-category.model';
import { FilterGmsCategoryInput } from '../dtos/filter-gms-category.input.dto';
import { UpdateGmsCategoryInput } from '../dtos/update-gms-category-input.dto';
import { GmsCategoryService } from '../services/gms-category.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';

@Controller('admin/gmsCategory')
@ApiTags('GmsCategory')
@ApiBearerAuth('access-token')
export class GmsCategoryController {
  constructor(private readonly gmsCategoryService: GmsCategoryService) {}

  @Post()
  @UseGuards(PermissionGuard('GmsCategory-Create'))
  async create(
    @Body() creategmsCategoryInput: CreateGmsCategoryInput,
    @CurrentUser() currentUser: any,
  ): Promise<GenericResponse<GmsCategory>> {
    return this.gmsCategoryService.create(creategmsCategoryInput, currentUser);
  }

  @Get()
  @UseGuards(PermissionGuard('GmsCategory-Read'))
  async findAll(
    @Query() filterGmsCategoryInput: FilterGmsCategoryInput,
    @CurrentUser() currentUser: any,
  ): Promise<PaginatedList<GmsCategory>> {
    return await this.gmsCategoryService.findAll(
      filterGmsCategoryInput,
      currentUser,
    );
  }

  @Put(':id')
  @UseGuards(PermissionGuard('GmsCategory-Update'))
  async update(
    @Param('id') id: string,
    @Body() updateGmsCategoryInput: UpdateGmsCategoryInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<GmsCategory>> {
    return this.gmsCategoryService.update(id, updateGmsCategoryInput, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('GmsCategory-Delete'))
  async softDelete(
    @Param('id') id: bigint,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.gmsCategoryService.softDelete(id, user);
  }

  @Get(':id')
  @UseGuards(PermissionGuard('GmsCategory-Read'))
  async findOne(
    @Param('id') id: bigint,
  ): Promise<GenericResponse<GmsCategory>> {
    return this.gmsCategoryService.findOne(id);
  }
}
