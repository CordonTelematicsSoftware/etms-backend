import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrganizationDriverService } from '../services/organization-driver.service';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { OrganizationDriver } from '../models/organizationDriver.model';
import { CreateOrgDriverInput } from '../dtos/create-orgDriver-input.dto';
import { OrgDriverFilterInput } from '../dtos/orgDriver-filter-input.dto';
import { ApiBearerAuth, ApiTags } from 'node_modules/@nestjs/swagger';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { UpdateOrgDriverInput } from '../dtos/update-orgDriver-input.dto';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('organizationDriver')
@ApiTags('OrganizationDriver')
@ApiBearerAuth('access-token')
export class OrganizationDriverController {
  constructor(private readonly orgDriverService: OrganizationDriverService) {}

  @Post()
  @UseGuards(PermissionGuard('Assign Drivers-Create'))
  async assignDrivers(
    @Body() createOrgDriverInput: CreateOrgDriverInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<OrganizationDriver>> {
    return this.orgDriverService.assignDrivers(createOrgDriverInput, user);
  }

  @Get()
  @UseGuards(PermissionGuard('Assign Drivers-Read'))
  async findAllDriversByOrgID(
    @Query() orgDriverFilterInput: OrgDriverFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<OrganizationDriver>> {
    const result = await this.orgDriverService.findAllDriversByOrgID(
      orgDriverFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, [
        'driver.image',
        'driver.documents[].url',
      ]),
    };
  }

  // @Get('orgDriverList-for-dashboard')
  // @UseGuards(PermissionGuard('Dashboard-Read'))
  // async listDriversByOrgID(
  //   @Query() orgDriverFilterInput: OrgDriverFilterInput,
  //   @CurrentUser() user: any,
  // ): Promise<PaginatedList<OrganizationDriver>> {
  //   return this.orgDriverService.findAllDriversByOrgID(
  //     orgDriverFilterInput,
  //     user,
  //   );
  // }

  @Get('drivers-not-in-trips')
  @UseGuards(PermissionGuard('Assign Drivers-Read'))
  async listDriversByOrg(
    @Query() orgDriverFilterInput: OrgDriverFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<OrganizationDriver>> {
    const result = await this.orgDriverService.listDriversByOrg(
      orgDriverFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, [
        'driver.image',
        'driver.documents[].url',
      ]),
    };
  }

  @Get('list')
  @UseGuards(PermissionGuard('Assign Cabs-Read'))
  async listAllDriversByOrgID(
    @Query() orgDriverFilterInput: OrgDriverFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<OrganizationDriver>> {
    const result = await this.orgDriverService.listAllDriversByOrgID(
      orgDriverFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, [
        'driver.image',
        'driver.documents[].url',
      ]),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Assign Drivers-Read'))
  async findOneOrgDriver(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<OrganizationDriver>> {
    const result = await this.orgDriverService.findOneOrgDriver(id, user);
    return {
      ...result,
      data: signS3UrlFields(result?.data, [
        'driver.image',
        'driver.documents[].url',
      ]),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Assign Drivers',
      ),
    };
  }

  @Post('update-status')
  @UseGuards(PermissionGuard('Assign Drivers-Create'))
  async updateDriverStatus(
    @Body() updateOrgDriverInput: UpdateOrgDriverInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<OrganizationDriver[]>> {
    return this.orgDriverService.updateDriverStatus(updateOrgDriverInput, user);
  }
}
