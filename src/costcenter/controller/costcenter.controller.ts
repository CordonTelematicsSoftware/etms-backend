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
} from '@nestjs/common';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Costcenter } from '../model/costcenter.model';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdateCostcenterInput } from '../dtos/update-cost-center-input.dto';
import { CostcenterService } from '../service/costcenter.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CreateCostcenterInput } from '../dtos/create-costcenter-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CostcenterFilterInput } from '../dtos/cost-center-filter-input.dto';

@Controller('admin/costcenter')
@ApiTags('Costcenter')
@ApiBearerAuth('access-token')
export class CostcenterController {
  constructor(private readonly costcenterService: CostcenterService) {}

  @Post()
  @UseGuards(PermissionGuard('Cost Center-Create'))
  async create(
    @Body() createCostcenterInput: CreateCostcenterInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Costcenter>> {
    return this.costcenterService.create(createCostcenterInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Cost Center-Read'))
  async findAll(
    @Query() costcenterFilterInput: CostcenterFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Costcenter>> {
    return {
      ...(await this.costcenterService.findAll(costcenterFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cost Center',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Cost Center-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Costcenter>> {
    return {
      ...(await this.costcenterService.findOne(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cost Center',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Cost Center-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateCostcenterInput: UpdateCostcenterInput,
  ): Promise<GenericResponse<Costcenter>> {
    return {
      ...(await this.costcenterService.update(id, updateCostcenterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cost Center',
      ),
    };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Cost Center-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return {
      ...(await this.costcenterService.softDelete(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Cost Center',
      ),
    };
  }
}
