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
import { Process } from '../models/process.model';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdateProcessInput } from '../dtos/update-process-input.dto';
import { ProcessService } from '../services/process.service';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CreateProcessInput } from '../dtos/create-process-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ProcessFilterInput } from '../dtos/process-filter-input.dto';

@Controller('admin/process')
@ApiTags('Process')
@ApiBearerAuth('access-token')
export class ProcessController {
  constructor(private readonly processService: ProcessService) {}

  @Post()
  @UseGuards(PermissionGuard('Process-Create'))
  async create(
    @Body() createProcessInput: CreateProcessInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Process>> {
    return this.processService.create(createProcessInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Process-Read'))
  async findAll(
    @Query() processFilterInput: ProcessFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Process>> {
    return {
      ...(await this.processService.findAll(processFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Process',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Process-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Process>> {
    return {
      ...(await this.processService.findOne(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Process',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Process-Update'))
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateProcessInput: UpdateProcessInput,
  ): Promise<GenericResponse<Process>> {
    return {
      ...(await this.processService.update(id, updateProcessInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Process',
      ),
    };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Process-Delete'))
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return {
      ...(await this.processService.softDelete(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Process',
      ),
    };
  }
}
