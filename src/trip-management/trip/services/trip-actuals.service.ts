import {
  BadRequestException,
  Injectable,
  Logger,
  //   NotFoundException,
  forwardRef,
  Inject,
  NotFoundException,
  InternalServerErrorException,
  //   InternalServerErrorException,
} from 'node_modules/@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { TripActual } from '../models/trip-actual.model';
import { TripActualsDto } from '../dtos/trip-actuals.dto';
// import { BillingPlans, TripStatus } from 'src/shared/enums';
import { BillingConfigurationService } from 'src/billing-module/services/billing-configuration.service';
// import { Trip } from '../models/trip.model';
import { TripService } from './trip.service';
import { GenericResponse } from 'src/shared/interfaces/generic-response';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { Trip } from '../models/trip.model';
import { BillingPlans, TripStatus, UserType } from 'src/shared/enums';
import { Transaction } from 'sequelize';
import * as moment from 'moment';

// Optional, trailing extras for update()/calculateTripActuals(). Existing
// positional callers (completeTrip) omit this and keep their current behaviour.
export interface TripActualUpdateOptions {
  actualStartDate?: string;
  actualStartTime?: string;
  actualEndDate?: string;
  actualEndTime?: string;
  actualCostOverride?: number;
  isCostOverridden?: boolean;
  securityAmount?: number;
}

const isPresent = (value: any): boolean =>
  value !== undefined && value !== null;

// The DTO accepts both 'YYYY-MM-DD' and a full ISO timestamp (a GET on a DATE
// column returns the latter). Take the literal date part rather than parsing:
// moment(iso).format() would shift the day for a UTC-midnight value on a
// server in a negative-offset timezone.
const normaliseDate = (value: string): string =>
  isPresent(value) ? String(value).slice(0, 10) : value;

@Injectable()
export class TripActualsService {
  private logger = new Logger(TripActualsService.name);
  constructor(
    @InjectModel(TripActual)
    private tripActualModel: typeof TripActual,
    private readonly sequelize: Sequelize,
    @Inject(forwardRef(() => BillingConfigurationService))
    private billingConfigurationService: BillingConfigurationService,
    @Inject(forwardRef(() => TripService))
    private tripService: TripService,
    private eventlogService: EventLogService,
  ) {}

  // Formats a date as DD/MM/YYYY, date-only. Leaves non-date-like or
  // falsy values untouched.
  private formatDateOnly(value: any): any {
    if (!value) return value;
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  async create(
    tripActualsInput: TripActualsDto,
    user: any,
    transaction?: Transaction,
  ): Promise<TripActual> {
    try {
      const {
        tripID,
        actualDistance,
        actualCost,
        billingRate,
        actualEndDate,
        actualEndTime,
        actualStartDate,
        actualStartTime,
      } = tripActualsInput;
      const tripActual = await this.tripActualModel.create(
        {
          tripID,
          actualDistance,
          actualCost,
          billingRate,
          actualEndDate,
          actualEndTime,
          actualStartDate,
          actualStartTime,
        },
        { ...(transaction && { transaction }) },
      );
      const eventPayload = JSON.parse(JSON.stringify(tripActualsInput));
      // payload was the raw tripActual model instance with no
      // changeJSON, so it rendered via DetailTable's payloadJSON
      // branch — actualStartDate/actualEndDate showed as raw
      // YYYY-MM-DD instead of a formatted date.
      const eventLog = {
        objectType: 'Trip Actuals',
        changeType: 'add',
        objectID: tripActual.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: {
          ...tripActual.get({ plain: true }),
          actualStartDate: this.formatDateOnly(tripActual.actualStartDate),
          actualEndDate: this.formatDateOnly(tripActual.actualEndDate),
        },
        requestPayload: eventPayload,
        user,
      };
      this.eventlogService.create(eventLog);
      return tripActual;
    } catch (error) {
      if (error.status !== 500) {
        throw new BadRequestException('Trip actual creation failed!', error);
      }
      throw new BadRequestException('Trip actual creation failed!', error);
    }
  }

  async calculateTripActuals(
    tripData: Trip,
    totalKM: number,
    tripID: number,
    user: any,
    remarks?: string,
    options?: TripActualUpdateOptions,
  ): Promise<TripActual> {
    try {
      // When the cost is overridden the computed rate is never used, so the
      // billing-config lookup is skipped entirely - a trip is often overridden
      // precisely because no slab matches it, and that lookup would throw.
      const existing = await this.tripActualModel.findOne({
        where: { tripID },
      });
      const overrideActive = isPresent(options?.isCostOverridden)
        ? options.isCostOverridden
        : existing?.isCostOverridden === true;

      if (overrideActive) {
        return await this.update(
          tripID,
          totalKM,
          0,
          null,
          user,
          remarks,
          options,
        );
      }

      // actualDistance is optional on the DTO, but every branch below
      // multiplies by it. An un-override request ({isCostOverridden:false})
      // sends no distance, so fall back to what is already on the row; reject
      // rather than letting NaN reach actualCost, which is a VARCHAR and would
      // happily store the string "NaN" as the billing amount.
      //
      // Gate on the RAW value, not the coerced one: Number(null) and
      // Number('') are both 0, so coercing first would let a row whose
      // actualDistance was never set (the state startTrip creates) recompute
      // to a cost of zero instead of being rejected.
      const rawKM = isPresent(totalKM) ? totalKM : existing?.actualDistance;
      const effectiveKM = Number(rawKM);
      if (
        !isPresent(rawKM) ||
        String(rawKM).trim() === '' ||
        !Number.isFinite(effectiveKM)
      ) {
        throw new BadRequestException(
          'actualDistance is required to recalculate the trip cost.',
        );
      }

      let actualCost = 0;
      let securityAmount = 0;
      let updatedBillingRate = null;
      const billingRate =
        await this.billingConfigurationService.getVehicleBillingRate(
          tripData?.vendorID,
          tripData?.orgID,
          tripData?.seats,
        );
      if (billingRate.billingPlan === BillingPlans.PerKMBilling) {
        actualCost = billingRate.ratePerKm * effectiveKM;
      }
      if (billingRate.billingPlan === BillingPlans.PerTripSlabBilling) {
        if (effectiveKM <= billingRate.thresholdKm) {
          actualCost = billingRate.baseFare;
        } else {
          const kmDifference = effectiveKM - Number(billingRate.thresholdKm);
          const additionalAmount =
            kmDifference * billingRate.additionalRatePerKm;
          actualCost = Number(billingRate.baseFare) + Number(additionalAmount);
        }
        if (tripData.spock && billingRate.securityAmount) {
          securityAmount = Number(billingRate.securityAmount);
          actualCost = Number(actualCost) + securityAmount;
        }
      }
      if (billingRate.billingPlan === BillingPlans.PerTripMultiSlabBilling) {
        //check tot km within the rage
        const billingRange =
          billingRate.multiSlabRates.find(
            (item) =>
              effectiveKM >= item.minDistance &&
              effectiveKM <= item.maxDistance,
          ) || null;

        if (billingRange) {
          actualCost = billingRange.rate;
          if (tripData.spock) {
            securityAmount = Number(billingRange.securityAmount);
            actualCost = billingRange.rate + securityAmount;
          }

          updatedBillingRate = {
            ...billingRate.dataValues,
            appliedBillingRate: billingRange,
          };
        } else {
          throw new NotFoundException(
            `No matching rate found for total KM: ${effectiveKM}. Please check the billing configuration distance ranges.`,
          );
        }
      }

      const tripActuals = await this.update(
        tripID,
        effectiveKM,
        actualCost,
        billingRate.billingPlan === BillingPlans.PerTripMultiSlabBilling
          ? updatedBillingRate
          : billingRate,
        user,
        remarks,
        // Must be forwarded here too: this is the path that runs when the cost
        // is NOT overridden, so it carries the client's date/time edits and
        // the isCostOverridden:false that turns an override back off.
        { ...options, securityAmount },
      );
      return tripActuals;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    tripID: number,
    actualDistance: number,
    actualCost: number,
    billingRate: any,
    user: any,
    remarks?: string,
    options?: TripActualUpdateOptions,
  ): Promise<TripActual> {
    try {
      const tripActual = await this.tripActualModel.findOne({
        where: { tripID },
      });

      if (!tripActual) {
        throw new NotFoundException(`Trip actual  not found.`);
      }
      // Snapshot before mutating so the audit diff below reports real
      // old/new pairs.
      const before = tripActual.get({ plain: true });

      // The request flag wins when supplied, otherwise fall back to what is
      // already on the row - that is what stops a later completeTrip recompute
      // from clobbering an override.
      const overrideActive = isPresent(options?.isCostOverridden)
        ? options.isCostOverridden
        : tripActual.isCostOverridden === true;

      if (isPresent(options?.isCostOverridden)) {
        tripActual.isCostOverridden = options.isCostOverridden;
      }
      if (isPresent(options?.actualCostOverride)) {
        // Column is VARCHAR, matching actualCost - stringify explicitly.
        tripActual.actualCostOverride = options.actualCostOverride.toString();
      }

      const currentTime = moment().format('HH:mm:ss');
      const currentDate = moment().format('YYYY-MM-DD');

      if (isPresent(actualDistance)) {
        tripActual.actualDistance = actualDistance.toString();
      }

      if (overrideActive) {
        // The flag is a plain boolean with no DB-level tie to the amount, so a
        // row can in principle carry the flag without a value. Fail loudly
        // rather than falling through and zeroing actualCost.
        if (!isPresent(tripActual.actualCostOverride)) {
          throw new BadRequestException(
            'isCostOverridden is set but actualCostOverride is missing on this row.',
          );
        }
        tripActual.actualCost = tripActual.actualCostOverride.toString();
      } else {
        tripActual.actualCost = actualCost.toString();
        tripActual.billingRate = billingRate;
      }

      if (isPresent(options?.securityAmount)) {
        tripActual.securityAmount = options.securityAmount;
      }

      // Stamp now() only on the first save, when the row has no end yet
      // (startTrip inserts both as null). Once an admin has set a real end
      // date, a later distance-only save must not silently move it to today.
      if (isPresent(options?.actualEndDate)) {
        tripActual.actualEndDate = normaliseDate(options.actualEndDate);
      } else if (!isPresent(tripActual.actualEndDate)) {
        tripActual.actualEndDate = currentDate;
      }
      if (isPresent(options?.actualEndTime)) {
        tripActual.actualEndTime = options.actualEndTime;
      } else if (!isPresent(tripActual.actualEndTime)) {
        tripActual.actualEndTime = currentTime; // Format time as HH:mm:ss
      }
      if (isPresent(options?.actualStartDate)) {
        tripActual.actualStartDate = normaliseDate(options.actualStartDate);
      }
      if (isPresent(options?.actualStartTime)) {
        tripActual.actualStartTime = options.actualStartTime;
      }
      // Only overwrite remarks when the caller supplied them. Assigning
      // unconditionally wiped an admin's remark on every recompute.
      if (remarks !== undefined) {
        tripActual.remarks = remarks;
      }
      await tripActual.save();

      const after = tripActual.get({ plain: true });

      const eventPayload = {
        tripID,
        actualDistance,
        actualCost,
        billingRate,
      };

      // Built explicitly and passed through to EventLogService rather than
      // letting createChangeJson derive it: that helper skips falsy new values,
      // which would drop isCostOverridden:false and a zero override.
      const trackedFields = [
        'actualDistance',
        'actualCost',
        'securityAmount',
        'actualCostOverride',
        'isCostOverridden',
        'actualStartDate',
        'actualStartTime',
        'actualEndDate',
        'actualEndTime',
        'remarks',
      ];
      const dateFields = ['actualStartDate', 'actualEndDate'];
      const changeJSON: Record<string, any> = {};
      for (const field of trackedFields) {
        if (String(before[field]) !== String(after[field])) {
          const isDate = dateFields.includes(field);
          changeJSON[field] = {
            OldValue: isDate
              ? this.formatDateOnly(before[field])
              : before[field],
            newValue: isDate ? this.formatDateOnly(after[field]) : after[field],
          };
        }
      }
      if (overrideActive) {
        changeJSON.billingRateLookup = {
          OldValue: 'computed',
          newValue: 'skipped (cost overridden)',
        };
      }

      const eventLog = {
        objectType: 'Trip Actuals',
        changeType: 'edit',
        objectID: tripActual.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        // Was payload: tripActual — the raw model instance. When
        // changeJSON ends up empty (no tracked field actually
        // changed), the row falls through to DetailTable's
        // payloadJSON branch and renders this raw payload directly,
        // bypassing changeJSON's date formatting entirely — same
        // curated-payload treatment as create().
        payload: {
          ...after,
          actualStartDate: this.formatDateOnly(after.actualStartDate),
          actualEndDate: this.formatDateOnly(after.actualEndDate),
        },
        requestPayload: eventPayload,
        changeJSON,
        user,
      };

      this.eventlogService.create(eventLog);

      return tripActual;
    } catch (error) {
      if (error.status !== 500) {
        throw new BadRequestException('Trip actual update failed!', error);
      }
      throw new InternalServerErrorException(error);
    }
  }

  async saveTripActuals(
    tripActualsDto: TripActualsDto,
    user: any,
  ): Promise<GenericResponse<TripActual>> {
    try {
      // Cross-field, so it cannot live on the DTO. Both directions are
      // rejected: an override with no amount would silently fall back to the
      // computed cost, and an amount with no flag would be stored but never
      // applied. Either way the admin would believe an override took effect
      // when it did not.
      const overrideRequested = tripActualsDto.isCostOverridden === true;
      const overrideAmountGiven = isPresent(tripActualsDto.actualCostOverride);
      if (overrideRequested && !overrideAmountGiven) {
        throw new BadRequestException(
          'actualCostOverride is required when isCostOverridden is true',
        );
      }
      if (overrideAmountGiven && !overrideRequested) {
        throw new BadRequestException(
          'actualCostOverride requires isCostOverridden: true',
        );
      }

      const tripData = await this.tripService.findOne(tripActualsDto.tripID);
      // tripService.findOne is a findByPk with no org filter and is shared by
      // many callers, so the tenancy check lives here: a trip outside the
      // caller's org is reported as not found, never edited.
      //
      // Both sides are BIGINT read through Sequelize, which the pg driver
      // hands back as a string, so they are compared as strings - a raw !==
      // between "11" and 11 would 404 every request. Precedent for coercing
      // here: trip-request.service.ts:1420. The explicit orgID presence check
      // stops a principal with no orgID matching a trip whose orgID is null.
      // SuperAdmin carries no orgID (auth.service.ts:1135 "undefined for
      // SuperAdmin only") and is exempt from org filters elsewhere in the repo
      // - see role.service.ts:60-63. Without this exemption every SuperAdmin
      // billing edit would 404.
      const isSuperAdmin = user?.userType === UserType.SuperAdmin;
      if (
        !tripData ||
        (!isSuperAdmin &&
          (!isPresent(user?.orgID) ||
            String(tripData.orgID) !== String(user.orgID)))
      ) {
        throw new NotFoundException('Trip not found');
      }
      if (tripData.status !== TripStatus.Completed) {
        throw new NotFoundException(
          `The trip has not been completed yet. Please update its status to completed.`,
        );
      }
      const tripActuals = await this.calculateTripActuals(
        tripData,
        tripActualsDto.actualDistance,
        tripActualsDto.tripID,
        user,
        tripActualsDto.remarks,
        {
          actualStartDate: tripActualsDto.actualStartDate,
          actualStartTime: tripActualsDto.actualStartTime,
          actualEndDate: tripActualsDto.actualEndDate,
          actualEndTime: tripActualsDto.actualEndTime,
          actualCostOverride: tripActualsDto.actualCostOverride,
          isCostOverridden: tripActualsDto.isCostOverridden,
        },
      );
      return {
        message: 'Trip bill updated',
        data: tripActuals,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findTripActualDataWithTripID(tripID: string): Promise<TripActual> {
    try {
      const trip = await this.tripActualModel.findOne({
        where: {
          tripID: tripID,
        },
      });
      return trip;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
