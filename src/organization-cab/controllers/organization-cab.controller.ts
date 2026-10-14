import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrganizationCabService } from '../services/organization-cab.service';
import { ApiBearerAuth, ApiTags } from 'node_modules/@nestjs/swagger';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { CreateOrgCabInput } from '../dtos/create-orgCab-input.dto';
import { OrganizationCab } from '../models/organizationCab.model';
import { OrgCabFilterInput } from '../dtos/orgCab-filter-input.dto';
import { UpdateOrgCabInput } from '../dtos/update-orgCab-input.dto';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { NearbyCabsInput } from '../dtos/nearby-cabs-input.dto';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('organizationCab')
@ApiTags('OrganizationCab')
@ApiBearerAuth('access-token')
export class OrganizationCabController {
  constructor(private readonly orgCabService: OrganizationCabService) {}

  @Post()
  @UseGuards(PermissionGuard('Assign Cabs-Create'))
  async assignCabs(
    @Body() createOrgCabInput: CreateOrgCabInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<OrganizationCab>> {
    return this.orgCabService.assignCabs(createOrgCabInput, user);
  }

  @Get('nearby-cabs')
  @UseGuards(PermissionGuard('Assign Cabs-Read'))
  async getNearbyCabs(
    @Query() nearbyCabsInput: NearbyCabsInput,
    @CurrentUser() user: any,
  ) {
    return this.orgCabService.getNearbyCabs(nearbyCabsInput, user);
  }

  @Get('organizationDetails')
  @UseGuards(PermissionGuard('Assign Cabs-Read'))
  async findAllCountsByOrgID(@CurrentUser() user: any): Promise<any> {
    return this.orgCabService.findAllCountsByOrgID(user);
  }

  @Get()
  @UseGuards(PermissionGuard('Assign Cabs-Read'))
  async findAllCabsByOrgID(
    @Query() orgCabFilterInput: OrgCabFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<OrganizationCab>> {
    const result = await this.orgCabService.findAllCabsByOrgID(
      orgCabFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['cab.documents[].url']),
    };
  }

  @Get('qrCode/:id')
  @UseGuards(PermissionGuard('Assign Cabs-Read'))
  async generateCabQr(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<OrganizationCab>> {
    return {
      ...(await this.orgCabService.generateQR(id, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Assign Cabs',
      ),
    };
  }

  @Get('orgDataCounts-for-dashboard')
  @UseGuards(PermissionGuard('Dashboard-Read'))
  async listCabsByOrgID(@CurrentUser() user: any) {
    return await this.orgCabService.getDashboardCounts(user);
  }

  @Get('cabs-not-in-trips')
  @UseGuards(PermissionGuard('Assign Cabs-Read'))
  async listCabsByOrg(
    @Query() orgCabFilterInput: OrgCabFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<OrganizationCab>> {
    const result = await this.orgCabService.listCabsByOrg(
      orgCabFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['cab.documents[].url']),
    };
  }

  @Get('list')
  @UseGuards(PermissionGuard('Assign Cabs-Read'))
  async listAllCabsByOrgID(
    @Query() orgCabFilterInput: OrgCabFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<OrganizationCab>> {
    const result = await this.orgCabService.listAllCabsByOrgID(
      orgCabFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, ['cab.documents[].url']),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Assign Cabs-Read'))
  async findOneOrgCab(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<OrganizationCab>> {
    const result = await this.orgCabService.findOneOrgCab(id, user);
    return {
      ...result,
      data: signS3UrlFields(result?.data, ['cab.documents[].url']),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Assign Cabs',
      ),
    };
  }

  @Post('update-status')
  @UseGuards(PermissionGuard('Assign Cabs-Create'))
  async updateCabStatus(
    @Body() updateOrgCabInput: UpdateOrgCabInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<OrganizationCab[]>> {
    return this.orgCabService.updateCabStatus(updateOrgCabInput, user);
  }
}
