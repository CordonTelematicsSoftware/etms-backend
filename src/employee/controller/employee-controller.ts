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
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { EmployeeService } from '../services/employee-service';
import { Employee } from '../models/employee.model';
import { CreateEmployeeInput } from '../dtos/create-employee-input.dto';
import { UpdateEmployeeInput } from '../dtos/update-employee-input.dto';
import { EmployeeFilterInput } from '../dtos/employee-filter-input.dto';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { FileInterceptor } from 'node_modules/@nestjs/platform-express';
import { EmployeeListFilterInput } from '../dtos/employeeList-filter-input.dto ';
import { Cron } from '@nestjs/schedule';
import {
  excelFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';

@Controller('admin/employee')
@ApiTags('Employee')
@ApiBearerAuth('access-token')
export class EmployeeController {
  private logger = new Logger(EmployeeController.name);
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @UseGuards(PermissionGuard('Employee-Create'))
  async create(
    @Body() createEmployeeInput: CreateEmployeeInput,
    password: string,
    @CurrentUser() currentUser: any,
  ): Promise<GenericResponse<Employee>> {
    return this.employeeService.create(
      createEmployeeInput,
      password,
      currentUser,
    );
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
    return await this.employeeService.importEmployees(file.buffer, user);
  }

  @Post('import-employees-zone')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: excelFileFilter,
      // limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importEmployeesZoneMannualy(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<object> {
    if (!file) {
      throw new BadRequestException('File is required.');
    }
    validateUploadedFile(file, 'excel');
    this.logger.log('file---', file);
    return await this.employeeService.importEmployeesZone(file.buffer, user);
  }

  @Post('/unassign-from-zone')
  @UseGuards(PermissionGuard('Employee-Update'))
  async unassignEmployeesFromZone(
    @Body() body: { employeeIds: string[] },
    @CurrentUser() user: any,
  ): Promise<any> {
    return this.employeeService.unassignEmployeesFromZone(
      body.employeeIds,
      user,
    );
  }

  @Get('employees-without-location')
  @UseGuards(PermissionGuard('Employee-Read'))
  async findEmployeeWithNoLocation(
    @CurrentUser() user: any,
  ): Promise<Employee[]> {
    return await this.employeeService.findEmployeeWithNoLocation(user);
  }

  @Get()
  @UseGuards(PermissionGuard('Employee-Read'))
  async findAll(
    @Query() employeeFilterInput: EmployeeFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeService.findAll(employeeFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Employee',
      ),
    };
  }

  @Get('empList-for-dashboard')
  @UseGuards(PermissionGuard('Dashboard-Read'))
  async findAllEmployees(
    @Query() employeeFilterInput: EmployeeFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeService.findAll(employeeFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Dashboard',
      ),
    };
  }

  @Get('list')
  @UseGuards(PermissionGuard('Employee-Read'))
  async listAllEmployees(
    @Query() employeeListFilterInput: EmployeeListFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeService.listAllEmployees(
        employeeListFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Employee',
      ),
    };
  }

  @Get('list-report')
  @UseGuards(PermissionGuard('Report-Read'))
  async listAllEmployeesForReport(
    @Query() employeeListFilterInput: EmployeeListFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeService.allEmployees(
        employeeListFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Report',
      ),
    };
  }

  @Get('trip-search-employees')
  @UseGuards(PermissionGuard('Employee-Read'))
  async listAllEmployeesForTripSearch(
    @Query() employeeListFilterInput: EmployeeListFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeService.allEmployees(
        employeeListFilterInput,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Employee',
      ),
    };
  }

  @Get('get-transport-team')
  @UseGuards(PermissionGuard('Transport Team-Read'))
  async findAllTransportTeam(
    @Query() employeeFilterInput: EmployeeFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return {
      ...(await this.employeeService.findAll(employeeFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Transport Team',
      ),
    };
  }

  @Get('/employees-byOrganization')
  @UseGuards(PermissionGuard('Employee-Read'))
  async findAllemployeesByOrgID(
    @Query() employeeFilterInput: EmployeeFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return this.employeeService.findAllemployeesByOrgID(
      employeeFilterInput,
      user,
    );
  }

  @Get('/employees-byOrgId-tripView')
  @UseGuards(PermissionGuard('Employee-Read'))
  async findEmployeesByOrgIDTripView(
    @Query() employeeFilterInput: EmployeeFilterInput,
    @CurrentUser() user: any,
    @Query('date') date: string,
    @Query('shiftTime') shiftTime: string,
    @Query('pickDrop') pickDrop: string,
    @Query('search') search: string,
    @Query('excludeIds') excludeIds: string[],
  ): Promise<PaginatedList<Employee>> {
    return this.employeeService.findEmployeesByOrgIDTripView(
      employeeFilterInput,
      user,
      date,
      shiftTime,
      pickDrop,
      search,
      excludeIds,
    );
  }

  @Get('/reporting-managers')
  @UseGuards(PermissionGuard('Employee-Read'))
  async findAllManagers(
    @Query() employeeFilterInput: EmployeeFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Employee>> {
    return this.employeeService.findAllManagers(employeeFilterInput, user);
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Employee-Read'))
  async findOne(
    @Param('id') id: bigint,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Employee>> {
    return {
      ...(await this.employeeService.findOne(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Employee',
      ),
    };
  }

  @Put(':id')
  @UseGuards(PermissionGuard('Employee-Update'))
  async update(
    @Param('id') id: string,
    @Body() updateEmployeeInput: UpdateEmployeeInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Employee>> {
    return this.employeeService.update(id, updateEmployeeInput, user);
  }

  @Post('/employees-ByZone')
  @UseGuards(PermissionGuard('Employee-Read'))
  async eployeeSequalizedWithInZone(
    @Body() zoneEmployeeArray: any,
  ): Promise<any> {
    return this.employeeService.eployeeSequalizedWithInZone(zoneEmployeeArray);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Employee-Delete'))
  async softDelete(
    @Param('id') id: bigint,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<null>> {
    return this.employeeService.softDelete(id, user);
  }

  @Cron('0 0 19 * * *')
  async updateStatusAttrition(): Promise<any> {
    return await this.employeeService.updateStatusAttrition();
  }
}
