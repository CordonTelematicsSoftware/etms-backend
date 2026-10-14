import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BillingPlans } from 'src/shared/enums';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { BillingConfigurationInput } from '../dtos/billing-configuration-input.dto';

import { Op } from 'sequelize';
import { BillingRate } from '../models/billing-rate.model';

@Injectable()
export class BillingConfigurationService {
  private logger = new Logger(BillingConfigurationService.name);

  constructor(
    @InjectModel(BillingRate)
    private billingRateModel: typeof BillingRate,
  ) {}

  async create(
    billingConfigurationInput: BillingConfigurationInput,
    currentUser?: any,
  ): Promise<GenericResponse<BillingRate>> {
    try {
      const { vendorID, billingRates } = billingConfigurationInput;

      const billingRatesInput = billingRates.map((rate: any) => ({
        orgID: currentUser?.orgID,
        vendorID,
        billingPlan: rate.billingPlan,
        seats: rate.seats,
        ratePerKm:
          rate.billingPlan === BillingPlans.PerKMBilling
            ? rate.ratePerKm
            : null,
        baseFare:
          rate.billingPlan === BillingPlans.PerTripSlabBilling
            ? rate.baseFare
            : null,
        thresholdKm:
          rate.billingPlan === BillingPlans.PerTripSlabBilling
            ? rate.thresholdKm
            : null,
        additionalRatePerKm:
          rate.billingPlan === BillingPlans.PerTripSlabBilling
            ? rate.additionalRatePerKm
            : null,
        securityAmount:
          rate.billingPlan === BillingPlans.PerTripSlabBilling
            ? rate.securityAmount
            : null,
        multiSlabRates:
          rate.billingPlan === BillingPlans.PerTripMultiSlabBilling
            ? rate.multiSlabRates
            : [
                {
                  minDistance: '',
                  maxDistance: '',
                  rate: '',
                  securityAmount: '',
                },
              ],
      }));

      // Fetch existing records for comparison
      const existingRecords = await this.billingRateModel.findAll({
        where: { orgID: currentUser?.orgID, vendorID },
      });

      // Identify records to be deleted (not present in new input)
      const newKeys = billingRatesInput.map(
        (rate) => `${rate.orgID}-${rate.vendorID}-${rate.seats}`,
      );
      const recordsToDelete = existingRecords.filter(
        (record) =>
          !newKeys.includes(
            `${record.orgID}-${record.vendorID}-${record.seats}`,
          ),
      );

      // Restore soft-deleted records if they exist
      for (const rate of billingRatesInput) {
        const softDeletedRecord = await this.billingRateModel.findOne({
          where: {
            orgID: rate.orgID,
            vendorID: rate.vendorID,
            seats: rate.seats,
            deletedAt: { [Op.ne]: null },
          },
          paranoid: false,
        });

        if (softDeletedRecord) {
          await softDeletedRecord.restore();
        }

        await this.billingRateModel.upsert(rate, {
          conflictFields: ['orgID', 'vendorID', 'seats'],
        });
      }

      // Delete records that are not present in the new input
      if (recordsToDelete.length > 0) {
        await this.billingRateModel.destroy({
          where: {
            orgID: currentUser?.orgID,
            vendorID,
            seats: recordsToDelete.map((record) => record.seats),
          },
        });
      }

      return { status: true, message: 'Billing rates updated successfully' };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getVendorBillingConfigurations(
    vendorID: string,
    user: any,
  ): Promise<GenericResponse<BillingRate[]>> {
    try {
      const billingRates = await this.billingRateModel.findAll({
        where: { vendorID, orgID: user?.orgID },
        order: [['seats', 'ASC']],
      });

      if (billingRates) {
        return {
          message: 'Billing rates found',
          data: billingRates,
        };
      } else {
        throw new NotFoundException();
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Distinct seat counts a vendor has a BillingRate row for, in this org -
   * the source list for the billing-edit seats dropdown, so the admin can
   * only pick a seat count getVehicleBillingRate is guaranteed to resolve.
   *
   * GROUP BY rather than getVendorBillingConfigurations' plain findAll: a
   * seat count can have multiple billing-plan rows (the unique constraint is
   * on (orgID, vendorID, seats), so at most one per plan), and that method's
   * full-row list would repeat a seat count once per plan.
   */
  async getDistinctSeatOptions(
    vendorID: bigint,
    orgID: bigint,
  ): Promise<number[]> {
    try {
      const rows = await this.billingRateModel.findAll({
        where: { vendorID, orgID },
        attributes: ['seats'],
        group: ['seats'],
        order: [['seats', 'ASC']],
      });
      return rows.map((row) => row.seats);
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getVehicleBillingRate(
    vendorID: bigint,
    orgID: bigint,
    seats: string,
  ): Promise<BillingRate> {
    try {
      const billingRate = await this.billingRateModel.findOne({
        where: { vendorID, orgID, seats },
      });

      if (billingRate) {
        return billingRate;
      } else {
        throw new NotFoundException('Billing plan not found');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
