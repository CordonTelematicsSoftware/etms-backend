import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { User } from 'src/user/models/user.model';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import {
  CreateConfigInput,
  GetCutOffDto,
} from '../dtos/create-config-input.dto';
import { ConfigurationMaster } from '../models/config.model';
import { ConfigFilterInput } from '../dtos/config-filter-input.dts';
import { UpdateConfigInput } from '../dtos/update-config-input.dto';
import { ConfigurationService } from '../services/config.service';
import { EmployeeService } from 'src/employee/services/employee-service';
import { GetMultipleConfigValuesDto } from '../dtos/get-configs-input.dto';

@Controller('admin/config')
@ApiTags('Config')
@ApiBearerAuth('access-token')
export class AdminConfigController {
  constructor(
    private readonly configService: ConfigurationService,
    private readonly employeeService: EmployeeService,
  ) {}

  @Get('/organizationGroups')
  async organizationGroups(@CurrentUser() user: User): Promise<any> {
    return this.configService.organizationGroups('Organization Group', user);
  }

  @Post('create')
  @UseGuards(PermissionGuard('Config-Create'))
  async create(
    @Body() createConfigInput: CreateConfigInput,
    @CurrentUser() user: User,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    return this.configService.create(createConfigInput, user);
  }

  @Post('/get-multiple-config-values')
  // @UseGuards(PermissionGuard('Config-Create'))
  async getMultipleConfigValues(
    @Body() configNames: GetMultipleConfigValuesDto,
    @CurrentUser() user: User,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    return this.configService.getMultipleConfigValues(
      configNames.configNames,
      user,
    );
  }

  @Get()
  @UseGuards(PermissionGuard('Config-Read'))
  async findAll(
    @Query() configFilterInput: ConfigFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<ConfigurationMaster>> {
    return {
      ...(await this.configService.findAll(configFilterInput, user)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Config',
      ),
    };
  }

  @Get('getConfigValue')
  async getConfigValue(
    @Query('configName') configName: string,
    @CurrentUser() user: any,
  ): Promise<string> {
    return this.configService.getConfigValue(configName, user?.orgID);
  }

  @Get('configDetails')
  @UseGuards(PermissionGuard('Config-Read'))
  async findOneByName(
    @Query('configName') configName: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    return {
      ...(await this.configService.findOneByConfigName(configName, user)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Config',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Config-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    return {
      ...(await this.configService.findOne(id, user)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Config',
      ),
    };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard('Config-Update'))
  async update(
    @Param('id') id: string,
    @Body() updateConfigInput: UpdateConfigInput,
    @CurrentUser() user: User,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    return this.configService.update(id, updateConfigInput, user);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard('Config-Delete'))
  async softDelete(@Param('id') id: string): Promise<GenericResponse<null>> {
    return this.configService.delete(id);
  }

  @Get('shift/time')
  async getShiftTime(@CurrentUser() user: User): Promise<any> {
    try {
      const loginTime: string[] = await this.configService.getShiftConfigValue(
        user,
        'login time',
      );

      const logoutTime: string[] = await this.configService.getShiftConfigValue(
        user,
        'logout time',
      );
      //   console.log("logoutTime==================",logoutTime);

      if (!loginTime && !logoutTime) {
        return [];
      }
      const loginTimeOptions = Array.isArray(loginTime)
        ? loginTime.map((time) => ({
            label: time.trim(),
            value: time.trim(),
          }))
        : [];

      const logoutTimeOptions = Array.isArray(logoutTime)
        ? logoutTime.map((time) => ({
            label: time.trim(),
            value: time.trim(),
          }))
        : [];
      const result = {
        loginTime: loginTimeOptions,
        logoutTime: logoutTimeOptions,
      };
      return result;
    } catch (error) {
      throw error;
    }
  }

  @Get('all/shiftTimes')
  async getAllShiftTimes(@CurrentUser() user: User): Promise<any> {
    try {
      const loginTime: string[] = await this.configService.getShiftConfigValue(
        user,
        'login time',
      );

      const logoutTime: string[] = await this.configService.getShiftConfigValue(
        user,
        'logout time',
      );

      if (!loginTime && !logoutTime) {
        return [];
      }
      const loginTimes = Array.isArray(loginTime)
        ? loginTime.map((time) => ({
            type: 'Login',
            time: time.trim(),
          }))
        : [];

      const logoutTimes = Array.isArray(logoutTime)
        ? logoutTime.map((time) => ({
            type: 'Logout',
            time: time.trim(),
          }))
        : [];

      const result = [...loginTimes, ...logoutTimes];

      return result;
    } catch (error) {
      throw error;
    }
  }

  @Get('employee/shiftTime')
  async getEmployeeShiftTime(@CurrentUser() user: User): Promise<any> {
    try {
      const employeeId = (user as any).employeeID;
      // 1. Get team shift details from service
      const teamShift = await this.employeeService.getEmployeeTeamShiftDetails(
        employeeId,
        user,
      );
      let loginTimeOptions: { label: string; value: string }[] = [];
      let logoutTimeOptions: { label: string; value: string }[] = [];

      if (teamShift?.loginTime?.length || teamShift?.logoutTime?.length) {
        // Employee has a team with shift enabled
        loginTimeOptions = (teamShift.loginTime || []).map((time: string) => ({
          label: time,
          value: time,
        }));

        logoutTimeOptions = (teamShift.logoutTime || []).map(
          (time: string) => ({
            label: time,
            value: time,
          }),
        );
      } else {
        // Fallback to config service if no team or shift disabled
        const loginTime: string[] =
          await this.configService.getShiftConfigValue(user, 'login time');
        const logoutTime: string[] =
          await this.configService.getShiftConfigValue(user, 'logout time');

        loginTimeOptions = Array.isArray(loginTime)
          ? loginTime.map((time) => ({
              label: time.trim(),
              value: time.trim(),
            }))
          : [];

        logoutTimeOptions = Array.isArray(logoutTime)
          ? logoutTime.map((time) => ({
              label: time.trim(),
              value: time.trim(),
            }))
          : [];
      }

      return { loginTime: loginTimeOptions, logoutTime: logoutTimeOptions };
    } catch (error) {
      throw error;
    }
  }

  @Get('shift/time-for-trip')
  async getShiftTimeForTrip(@CurrentUser() user: User): Promise<any> {
    try {
      const result = [];
      const loginTime: string[] = await this.configService.getShiftConfigValue(
        user,
        'login time',
      );
      const logoutTime: string[] = await this.configService.getShiftConfigValue(
        user,
        'logout time',
      );

      if (!loginTime && !logoutTime) {
        return [];
      }
      const length = Math.min(loginTime.length, logoutTime.length);
      for (let i = 0; i < length; i++) {
        result.push({
          Pick: loginTime[i],
          Drop: logoutTime[i],
        });
      }
      return result;
    } catch (error) {
      throw error;
    }
  }

  @Get('/get/medical-or-adhoc')
  async getMedicalOrAdHoc(@CurrentUser() user: User): Promise<string[]> {
    return this.configService.getMedicalAndAdhoc(user);
  }

  @Get('/get/cut-off/:type')
  async getCutOff(
    @Param() params: GetCutOffDto,
    @CurrentUser() user: User,
  ): Promise<string> {
    return this.configService.getCutOff(params.type, user);
  }
}
