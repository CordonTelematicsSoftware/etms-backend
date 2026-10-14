import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { BillingConfigurationService } from '../services/billing-configuration.service';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { BillingConfigurationInput } from '../dtos/billing-configuration-input.dto';
import { BillingRate } from '../models/billing-rate.model';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';

@Controller('vendor/billing-configuration')
@ApiTags('Vendor Billing Configuration')
@ApiBearerAuth('access-token')
export class BillingConfigurationController {
  constructor(
    private readonly billingConfigurationService: BillingConfigurationService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard('Trip Billing Configuration-Create'))
  async create(
    @Body() billingConfigurationInput: BillingConfigurationInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<BillingRate>> {
    return this.billingConfigurationService.create(
      billingConfigurationInput,
      user,
    );
  }

  @Get('getVendorBillingConfigurations')
  @UseGuards(PermissionGuard('Trip Billing Configuration-Read'))
  async getVendorBillingConfigurations(
    @Query('vendorID') vendorID: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<BillingRate[]>> {
    return {
      ...(await this.billingConfigurationService.getVendorBillingConfigurations(
        vendorID,
        user,
      )),
      entityPermissions: user?.permissions?.filter(
        (permission) =>
          permission?.split('-')?.[0] === 'Trip Billing Configuration',
      ),
    };
  }
}
