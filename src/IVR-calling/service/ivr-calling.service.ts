import {
  Injectable,
  InternalServerErrorException,
  Logger,
  forwardRef,
  Inject,
  NotFoundException,
  BadRequestException,
} from 'node_modules/@nestjs/common';
import { Op } from 'sequelize';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { IVRCallInput } from '../dtos/ivr-call.dto';
import { TripService } from 'src/trip-management/trip/services/trip.service';
import { EmployeeService } from 'src/employee/services/employee-service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DriverService } from 'src/drivers/services/driver.service';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { SafeHomeIVRResponseDto } from '../dtos/safeHome-ivr-response.dto';
import { SafeHomeIVRHistory } from '../models/safeHomeIVRHistory.model';
import { InjectModel } from 'node_modules/@nestjs/sequelize';
import { CallStatus, ReadStatus, TripStatus } from 'src/shared/enums';
import * as moment from 'moment';
import { CoPassengerCallInput } from '../dtos/copassenger-call.dto';
import { EmailService } from 'src/email/email.service';
import { SosGateway } from 'src/alerts/gateways/sos.gateway';
import { Alert } from 'src/alerts/models/alert.model';
import { Employee } from 'src/employee/models/employee.model';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';

interface SafeHomeIVRContext {
  tripRequestID?: any;
  tripID?: any;
  orgID?: any;
  employeeID?: any;
}

// Everything the safe-home notifications need that is not already on the
// SafeHomeIVRHistory row. Each field is independently nullable — a lookup
// that fails must degrade the message, not block the escalation.
interface SafeHomeNotificationContext {
  employee: Employee | null;
  tripRequest: TripRequest | null;
  trip: Trip | null;
  // Ground-truth employee for this call: TripRequest.employeeID when the trip
  // request resolved, else whatever the history row carried.
  employeeID: any;
}

// Outcomes B and C raise the same alert type through the same template, so
// `remarks` is the only thing that tells an admin which one fired.
const SAFE_HOME_NOT_SAFE_REMARKS =
  'Safe home check: employee responded NOT SAFE on the safe home IVR call (pressed 2).';
const SAFE_HOME_NO_ANSWER_REMARKS =
  'Safe home check: employee did not answer 2 safe home IVR calls — safe arrival is unconfirmed.';
const SAFE_HOME_CONFIRMED_REASON =
  'Employee confirmed on the safe home IVR call that they reached home safely.';

// Alert.location is NOT NULL, but TripRequest.deboardLocation is nullable.
const SAFE_HOME_LOCATION_UNAVAILABLE = 'Location unavailable';

// Escalation goes to the SOS list. A safe-arrival confirmation is routine and
// goes to its own list so it does not page whoever is on SOS duty. The
// confirmation key is the one the PIN confirmation path already reads
// (mob-api.trip.service.ts:538), so both safe-home confirmations agree.
const SAFE_HOME_SOS_RECIPIENTS_CONFIG = 'SOS Email Alert Recipients';
const SAFE_HOME_CONFIRMATION_RECIPIENTS_CONFIG =
  'SAFE_HOME_CONFIRMATION_EMAIL_RECIPIENTS';

@Injectable()
export class IVRCallingService {
  private logger = new Logger(IVRCallingService.name);
  private apiConfig: {
    baseURL: string;
    headers: { accept: string; Authorization: string; 'content-type': string };
  };
  constructor(
    @InjectModel(SafeHomeIVRHistory)
    private safeHomeIVRHistoryModel: typeof SafeHomeIVRHistory,
    @InjectModel(TripRequest)
    private tripRequestModel: typeof TripRequest,
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(Alert)
    private alertModel: typeof Alert,
    @Inject(forwardRef(() => TripService))
    private tripService: TripService,
    @Inject(forwardRef(() => EmployeeService))
    private employeeService: EmployeeService,
    @Inject(forwardRef(() => DriverService))
    private driverService: DriverService,
    private eventlogService: EventLogService,
    private configService: ConfigService,
    private configurationService: ConfigurationService,
    private emailService: EmailService,
    private sosGateway: SosGateway,
  ) {
    this.apiConfig = {
      baseURL: 'https://api-smartflo.tatateleservices.com/v1',
      headers: {
        accept: 'application/json',
        Authorization: this.configService.get('IVR_CALL_TOKEN'),
        'content-type': 'application/json',
      },
    };
  }

  private readonly SAFE_HOME_RECORDING_ID = 176050;
  private readonly SAFE_HOME_DTMF_DIALPLAN_ID = '6a78183e429eed7c16513cef';
  private readonly SAFE_HOME_ACK_RECORDING_ID = 211631;
  // "Help is on the way" — played only to someone who pressed 2. Playing the
  // safe-arrival confirmation to her instead is what this constant fixes.
  private readonly SAFE_HOME_HELP_RECORDING_ID = 211977;

  // Gap between one attempt hanging up and the next being placed, so her phone
  // does not ring again the instant the previous call ends.
  private readonly SAFE_HOME_RETRY_GAP_MS = 60 * 1000;

  // A call that is still up was placed moments ago. Used to tell the live row
  // apart from a leftover pending row when attributing a DTMF response.
  private readonly SAFE_HOME_LIVE_CALL_WINDOW_MS = 2 * 60 * 1000;

  async safeHomePromptDialplan(dto: any) {
    this.logger.log(`safehome-prompt: ${JSON.stringify(dto)}`);
    return [
      {
        recording: {
          type: 'system',
          data: this.SAFE_HOME_RECORDING_ID,
          dtmf: { timeout: 6000, maxLength: 1, retry: 1 },
        },
      },
      { api_dialplan: { data: this.SAFE_HOME_DTMF_DIALPLAN_ID } },
    ];
  }

  async safeHomeDtmfDialplan(dto: any) {
    try {
      this.logger.log(`safehome-dtmf: ${JSON.stringify(dto)}`);

      const raw = Array.isArray(dto?.last_dtmf)
        ? dto.last_dtmf[0]
        : dto?.last_dtmf;
      const digit = String(raw ?? '')
        .replace(/\D/g, '')
        .slice(-1);

      const record = await this.resolveSafeHomeRecord(dto);

      if (!record) {
        this.logger.warn(
          'safehome-dtmf: no pending SAFEHOME_IVR row to attach to',
        );
        return this.safeHomeDtmfAck();
      }

      // Anything that is not 1 or 2 is not an answer to the question asked.
      // Replay the menu once so she gets an immediate second chance rather than
      // waiting for a whole fresh call.
      //
      // callUUID is the "a DTMF post has already been handled for this row"
      // marker — it is null until the first one lands. callStatus is left null
      // on that first pass on purpose: resolveSafeHomeRecord only matches
      // pending rows, so stamping it here would make a digit pressed on the
      // replay unresolvable, and we would be inviting a response we then throw
      // away.
      if (digit !== '1' && digit !== '2') {
        if (!record.callUUID) {
          this.logger.warn(
            `safehome-dtmf: no usable digit ("${digit}") on history row ${record.id} — replaying the menu once.`,
          );
          await this.safeHomeIVRHistoryModel.update(
            { callUUID: dto?.uuid },
            { where: { id: record.id } },
          );
          return this.safeHomeDtmfReprompt();
        }

        // Silent twice. Close the row and let the call end — the call-status
        // webhook picks it up as answered-with-no-response and retries.
        this.logger.warn(
          `safehome-dtmf: still no usable digit ("${digit}") on history row ${record.id} after a replay — leaving it to the call-status webhook.`,
        );
        await this.safeHomeIVRHistoryModel.update(
          {
            callStatus: CallStatus.Answered,
            digitPressed: digit || null,
          },
          { where: { id: record.id } },
        );
        return this.safeHomeDtmfAck();
      }

      await this.safeHomeIVRHistoryModel.update(
        {
          callUUID: dto?.uuid,
          callStatus: CallStatus.Answered,
          digitPressed: digit,
        },
        { where: { id: record.id } },
      );

      // Fire-and-forget: email/alert must not hold up the dialplan response,
      // Tata times out at 10s and replays the menu on an invalid response.
      if (digit === '1') {
        void this.handleSafeHomeConfirmed(record).catch((e: any) =>
          this.logger.error(`safehome-dtmf confirm failed: ${e?.message}`),
        );
      } else {
        void this.handleSafeHomeEscalation(
          record,
          SAFE_HOME_NOT_SAFE_REMARKS,
        ).catch((e: any) =>
          this.logger.error(`safehome-dtmf escalation failed: ${e?.message}`),
        );
      }

      return this.safeHomeDtmfAck(digit);
    } catch (e: any) {
      this.logger.error(`safehome-dtmf failed: ${e?.message}`);
      return this.safeHomeDtmfAck();
    }
  }

  /**
   * The dialplan leg has its own call_id, unrelated to the click-to-call
   * call_id on the history row, and the payload's caller_id_number is our own
   * DID — not the employee. So resolve the employee's number from the CDR for
   * this leg and match on that. Falls back to "latest pending" only if the CDR
   * lookup yields nothing, which is wrong under concurrency but better than
   * dropping the response entirely.
   */
  private async resolveSafeHomeRecord(
    dto: any,
  ): Promise<SafeHomeIVRHistory | null> {
    const since = new Date(Date.now() - 5 * 60 * 1000);
    const base: any = {
      callType: 'SAFE_HOME',
      callStatus: null,
      createdAt: { [Op.gte]: since },
    };

    try {
      const details = await this.getCallDetails(dto?.call_id);
      const row = details?.results?.[0];

      // refID is the only identifier Smartflo mints for us, so prefer it when the
      // CDR happens to expose one for this leg. The dialplan POST itself never
      // carries it, and the dialplan leg may well carry a different one from the
      // click-to-call leg (exactly as call_id does), so this is opportunistic —
      // the phone match below remains the primary correlator.
      const refID = row?.ref_id ?? row?.refId ?? null;

      if (refID) {
        const byRefID = await this.safeHomeIVRHistoryModel.findOne({
          where: { ...base, refID: String(refID) },
          order: [['createdAt', 'DESC']],
        });

        if (byRefID) return byRefID;
      }

      const candidates = [
        row?.client_number,
        row?.customer_no_with_prefix,
        row?.call_to_number,
        row?.destination,
      ]
        .filter(Boolean)
        .map((n: any) => String(n).replace(/\D/g, '').slice(-10))
        .filter((n: string) => n.length === 10);

      if (candidates.length) {
        const match = await this.safeHomeIVRHistoryModel.findOne({
          where: {
            ...base,
            [Op.or]: candidates.map((n) => ({
              employeePhone: { [Op.like]: `%${n}` },
            })),
          },
          order: [['createdAt', 'DESC']],
        });

        if (match) return match;

        this.logger.warn(
          `safehome-dtmf: CDR numbers [${candidates.join(
            ',',
          )}] matched no pending row`,
        );
      }
    } catch (e: any) {
      this.logger.error(`safehome-dtmf: CDR lookup failed: ${e?.message}`);
    }

    // A call that is still up was placed moments ago — dial, ring, answer and a
    // keypress fit inside the live window even with one menu replay. Anything
    // older is a leftover: a row whose missed-call webhook never matched its
    // callID, or a waitAndExecute test row, both of which stay pending for the
    // full five minutes and would otherwise make a live response unattributable.
    // Still exactly-one, so this narrows the candidates without ever guessing.
    const live = await this.safeHomeIVRHistoryModel.findAll({
      where: {
        ...base,
        createdAt: {
          [Op.gte]: new Date(Date.now() - this.SAFE_HOME_LIVE_CALL_WINDOW_MS),
        },
      },
      order: [['createdAt', 'DESC']],
    });

    if (live.length === 1) {
      return live[0];
    }

    // Fail closed. This used to return the newest pending row regardless of who
    // it belonged to, which under concurrency attributes a response — including
    // a "not safe" escalation — to whichever employee happened to be called most
    // recently, filing a real SOS against the wrong person with nothing logged.
    // Resolve only when there is exactly one candidate and the choice is
    // therefore not a guess.
    const pending = await this.safeHomeIVRHistoryModel.findAll({
      where: base,
      order: [['createdAt', 'DESC']],
    });

    if (pending.length === 1) {
      return pending[0];
    }

    this.logger.error(
      `safehome-dtmf: refusing to attribute this response — ${
        pending.length
      } pending SAFE_HOME rows in the last 5 minutes, cannot tell which is the caller. payload=${JSON.stringify(
        dto,
      )}`,
    );

    return null;
  }

  // A valid single action so Smartflo doesn't mark the response Invalid and
  // bounce the call into the failover IVR (which replays the menu).
  //
  // Digit 2 gets its own recording: playing "your safe arrival has been
  // recorded" to someone who just reported she is NOT safe is the bug this
  // branch fixes. Everything else — digit 1, an unresolved row, an unexpected
  // digit, a handler failure — gets the neutral acknowledgement, so there is
  // always exactly one valid action to return.
  private safeHomeDtmfAck(digit?: string) {
    if (digit === '2') {
      return [
        {
          recording: {
            type: 'system',
            data: this.SAFE_HOME_HELP_RECORDING_ID,
          },
        },
      ];
    }

    return [
      { recording: { type: 'system', data: this.SAFE_HOME_ACK_RECORDING_ID } },
    ];
  }

  /**
   * She answered but pressed nothing usable. Replay the menu once rather than
   * dropping her straight into the acknowledgement.
   *
   * The loop bound is callUUID, not callStatus. safeHomeDtmfDialplan writes
   * callUUID on the first DTMF post for a row and leaves callStatus null, so the
   * row stays resolvable and a digit pressed on this replay is still honoured.
   * A second post finds callUUID already set, closes the row and returns the
   * plain acknowledgement instead of replaying again. One reprompt, then the
   * call ends — and the call-status webhook picks it up as
   * answered-with-no-response and retries or escalates.
   */
  private safeHomeDtmfReprompt() {
    return [
      {
        recording: {
          type: 'system',
          data: this.SAFE_HOME_RECORDING_ID,
          dtmf: { timeout: 6000, maxLength: 1, retry: 1 },
        },
      },
      { api_dialplan: { data: this.SAFE_HOME_DTMF_DIALPLAN_ID } },
    ];
  }

  async connectEmployeeToDriver(
    ivrCallInput: IVRCallInput,
    user: any,
  ): Promise<any> {
    try {
      const { tripID } = ivrCallInput;
      const tripData = await this.tripService.findOne(Number(tripID));
      if (!tripData) {
        throw new NotFoundException('Trip not found.');
      }
      // Ensure a driver is assigned
      if (!tripData.driver) {
        throw new NotFoundException(
          'No driver has been linked to this trip yet.',
        );
      }
      const isEmployeeAssigned = tripData.employees?.some(
        (employee) => Number(employee.id) === Number(user.employeeID),
      );

      if (!isEmployeeAssigned) {
        throw new BadRequestException(
          'You are not authorized to connect with the driver for this trip.',
        );
      }

      if (tripData.status !== TripStatus.Ongoing) {
        throw new BadRequestException(
          'You can connect with the driver only after the trip has started.',
        );
      }
      const employeeData = await this.employeeService.findOne(
        user?.employeeID,
        user,
      );
      const driverPhone = tripData?.driver?.phone;
      const employeePhone = employeeData?.data?.phone;
      const payload = {
        async: 1,
        agent_number: employeePhone,
        destination_number: driverPhone,
        caller_id: 918069601600,
        get_call_id: 1,
      };
      const callRes = await this.clickToCall('click_to_call', payload, user);
      await this.getCallDetails(callRes.call_id);
      const ivrInput = {
        orgID: user?.orgID,
        tripID: Number(tripID),
        employeeID: user?.employeeID,
        employeePhone,
        driverPhone,
        refID: callRes?.ref_id,
        callID: callRes?.call_id,
        callType: 'EMPLOYEE_TO_DRIVER',
        callStatus: 'Queued',
        date: new Date(),
      };
      await this.safeHomeIVRHistoryModel.create(ivrInput);
      return {
        message: `Call initiated. Please hold while we connect you.`,
        data: null,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async connectDriverToEmployee(
    ivrCallInput: IVRCallInput,
    user: any,
  ): Promise<any> {
    try {
      const { employeeID, tripID } = ivrCallInput;
      const employeeData = await this.employeeService.findOne(
        BigInt(employeeID),
      );
      const tripData = await this.tripService.findOne(Number(tripID));
      if (!tripData) {
        throw new NotFoundException('Trip not found.');
      }
      const isEmployeeAssigned = tripData.employees?.some(
        (employee) => Number(employee.id) === Number(employeeID),
      );
      if (!isEmployeeAssigned) {
        throw new BadRequestException(
          'You are not authorized to connect with the driver for this trip.',
        );
      }

      if (tripData.status !== TripStatus.Ongoing) {
        throw new BadRequestException(
          'You can connect with the driver only after the trip has started.',
        );
      }
      const employeePhone = employeeData?.data?.phone;
      const driverPhone = tripData?.driver?.phone;
      if (driverPhone && employeePhone) {
        const payload = {
          async: 1,
          agent_number: driverPhone,
          destination_number: employeePhone,
          caller_id: 918069601600,
          get_call_id: 1,
        };
        const callRes = await this.clickToCall('click_to_call', payload, user);
        const ivrInput = {
          orgID: employeeData?.data?.orgID,
          tripID: Number(tripID),
          employeeID: BigInt(employeeID),
          employeePhone,
          driverPhone,
          refID: callRes?.ref_id,
          callID: callRes?.call_id,
          callType: 'DRIVER_TO_EMPLOYEE',
          callStatus: 'Queued',
          date: new Date(),
        };
        await this.safeHomeIVRHistoryModel.create(ivrInput);
      } else {
        throw new NotFoundException(
          `Driver or employee phone number is invalid. Please verify and try again.`,
        );
      }
      return {
        message: `Call initiated. Please hold while we connect you.`,
        data: null,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async connectEmployeeToCoPassenger(
    coPassengerCallInput: CoPassengerCallInput,
    user: any,
  ): Promise<any> {
    try {
      const { tripID, employeeID: targetEmployeeID } = coPassengerCallInput;

      const callerEmployeeID = String(user?.employeeID ?? '');
      const targetID = String(targetEmployeeID ?? '');

      if (!callerEmployeeID) {
        throw new BadRequestException('Caller employee could not be resolved.');
      }

      if (callerEmployeeID === targetID) {
        throw new BadRequestException('You cannot call yourself.');
      }

      // 1. Caller phone
      const callerData = await this.employeeService.findOne(
        user?.employeeID,
        user,
      );
      const callerPhone = callerData?.data?.phone;

      if (!callerPhone) {
        throw new NotFoundException(
          'Employee phone number not found. Please verify and try again.',
        );
      }

      // 2. Trip + security gate. The endpoint receives raw ids over HTTP, so both
      // parties must be proven to share this trip before any number is dialled.
      const trip = await this.tripService.findOne(parseInt(tripID));

      if (!trip) {
        throw new BadRequestException('Trip not found');
      }

      if (String(trip.orgID) !== String(user?.orgID)) {
        throw new BadRequestException('Trip not found');
      }

      if (trip.status !== TripStatus.Ongoing) {
        throw new BadRequestException(
          `Co-passenger calling is only available while the trip is Ongoing. Current status: ${trip.status}`,
        );
      }

      // employees[] keeps admin-removed entries with a removedByAdmin marker
      // instead of splicing them out; they are not part of the live roster.
      const activeEmployees = (trip.employees ?? []).filter(
        (emp: any) => emp?.removedByAdmin !== true,
      );

      const callerEntry = activeEmployees.find(
        (emp: any) => String(emp?.id) === callerEmployeeID,
      );

      if (!callerEntry) {
        throw new BadRequestException('You are not a passenger on this trip.');
      }

      const targetEntry = activeEmployees.find(
        (emp: any) => String(emp?.id) === targetID,
      );

      if (!targetEntry) {
        throw new BadRequestException(
          'The selected co-passenger is not on this trip.',
        );
      }

      // 3. Target phone. employees[] carries no phone field, so it is looked up.
      // Passing `user` scopes the lookup to the caller's organization.
      const targetData = await this.employeeService.findOne(
        targetID as any,
        user,
      );
      const targetPhone = targetData?.data?.phone;

      if (!targetPhone) {
        throw new NotFoundException(
          'Co-passenger phone number not found. Please try again later.',
        );
      }

      // 4. Bridge
      const payload = {
        async: 1,
        agent_number: callerPhone,
        destination_number: targetPhone,
        caller_id: 918069601600,
        get_call_id: 1,
      };

      const callRes = await this.clickToCall('click_to_call', payload, user);

      // 5. Log
      const ivrInput = {
        orgID: user?.orgID,
        employeeID: user?.employeeID,
        employeePhone: callerPhone,
        coPassengerPhone: targetPhone,
        tripID: trip.id,
        tripRequestID: targetEntry?.tripRequestID ?? null,
        refID: callRes?.ref_id,
        callID: callRes?.call_id,
        callType: 'EMPLOYEE_TO_COPASSENGER',
        callStatus: 'Queued',
        date: new Date(),
      };
      await this.safeHomeIVRHistoryModel.create(ivrInput);

      return {
        message: `Call initiated. Please hold while we connect you.`,
        data: null,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async clickToCall(apiEndPoint, payload, user?) {
    try {
      const response = await axios.post(
        `${this.apiConfig.baseURL}/${apiEndPoint}`,
        payload,
        { headers: this.apiConfig.headers },
      );
      if (user) {
        const eventPayload = JSON.parse(JSON.stringify({ payload }));
        const eventLog = {
          objectType: 'IVR Call',
          changeType: 'add',
          objectID: null,
          authID: user?.id,
          orgID: user?.orgID,
          updatedBy: user?.name,
          payload: payload,
          requestPayload: eventPayload,
          user,
        };
        await this.eventlogService.create(eventLog);
      }
      return response.data;
    } catch (error: any) {
      this.logger.error(
        'API Error:',
        error.response ? error.response.data : error.message,
      );
      throw error;
    }
  }

  async initiateSafeHomeIVR(
    employeePhone: string,
    context?: SafeHomeIVRContext,
  ): Promise<any> {
    this.logger.log('Waiting for 1 minutes...');
    await this.delay(0.2 * 60 * 1000); // 1 minutes = 10000 ms

    this.logger.log('1 minutes passed. Executing function...');
    const data = this.executeSafeHomeIVR(employeePhone, context).catch(
      (error: any) => {
        this.logger.error(
          'executeSafeHomeIVR failed:',
          error?.response ? error.response.data : error?.message,
        );
      },
    );
    return {
      message: 'Function executed after delay.',
      data: data,
    };
  }

  //   async executeSafeHomeIVR(employeePhone: string): Promise<any> {
  //     try {
  //       if (employeePhone) {
  //         const payload = {
  //           // async: 1,
  //           agent_number: employeePhone,
  //           destination_number: 918069601620,
  //           caller_id: 918069601600,
  //           get_call_id: 1,
  //         };
  //         const callRes = await this.clickToCall('click_to_call', payload);
  //         const callDetails = await this.getCallDetails(callRes.call_id);
  //         const call_id = callDetails.results[0]?.call_flow[3]?.time;
  //         // await this.safeHomeIVRHistoryModel.create({
  //         //   orgID: user.orgID,
  //         //   employeeID: user.employeeID,
  //         //   employeePhone,
  //         //   refID: callRes.ref_id,
  //         //   callType: 'SAFE_HOME',
  //         //   callStatus: 'QUEUED',
  //         //   date: new Date(),
  //         // });
  //         //OLDCODE
  //         await this.safeHomeIVRHistoryModel.create({
  //           // employeeID: 1,
  //           callUUID: null,
  //           callID: call_id,
  //           employeePhone: employeePhone,
  //           callStatus: null,
  //           date: new Date(),
  //         });
  //       } else {
  //         throw new NotFoundException(
  //           `Employee number is invalid. Please verify and try again.`,
  //         );
  //       }
  //       return {
  //         message: `Call initiated. Please hold while we connect you.`,
  //         data: null,
  //       };
  //     } catch (error: any) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //       throw new InternalServerErrorException(error);
  //     }
  //   }
  async executeSafeHomeIVR(
    employeePhone: string,
    context?: SafeHomeIVRContext,
  ): Promise<any> {
    try {
      if (employeePhone) {
        const payload = {
          async: 1,
          agent_number: employeePhone,
          destination_number: 918069601620,
          caller_id: 918069601600,
          get_call_id: 1,
        };
        const callRes = await this.clickToCall('click_to_call', payload);
        // const callDetails = await this.getCallDetails(callRes.call_id);

        const ivrInput = {
          employeePhone,
          callID: callRes?.call_id,
          // refID is the only identifier Smartflo mints for us and echoes back on
          // the call-status webhook, so it is the correlation key that lets
          // updateIVRCallStatus attach duration/recording to this row and spot a
          // call that was answered but never responded to. It was previously left
          // unstored because updateIVRCallStatus crashed when IVR_CALL_COST was
          // unset for the org; that read is guarded now, so storing it is safe.
          refID: callRes?.ref_id,
          callStatus: null,
          date: new Date(),
          tripRequestID: context?.tripRequestID,
          tripID: context?.tripID,
          orgID: context?.orgID,
          employeeID: context?.employeeID,
          callType: 'SAFE_HOME',
        };
        await this.safeHomeIVRHistoryModel.create(ivrInput);
      } else {
        throw new NotFoundException(
          `Employee number is invalid. Please verify and try again.`,
        );
      }
      return {
        message: `Call initiated. Please hold while we connect you.`,
        data: null,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async markSafeHomeFromIVR(
    safeHomeIVRResponseDto: SafeHomeIVRResponseDto,
  ): Promise<any> {
    try {
      const {
        uuid,
        call_id,
        // call_to_number,
        // caller_id_number,
        call_status,
        digit_pressed,
        // digits_dialed,
      } = safeHomeIVRResponseDto;

      this.logger.log(`Received IVR response`);
      let callStatus = null;

      if (digit_pressed === '1') {
        callStatus = CallStatus.Answered;
      } else if (digit_pressed === '2') {
        // She picked up and actively reported she is not safe, so the call
        // itself was Answered. The danger signal lives on TripRequest.safeHome,
        // not on the call log — and keeping this out of 'Missed' stops it
        // counting against hasTwoMissedCallsForTripRequest's retry cap.
        callStatus = CallStatus.Answered;
      } else {
        callStatus = call_status || CallStatus.Missed;
      }
      const callIDFromCallDetails = call_id.toString().split('.')[0];
      const record = await this.safeHomeIVRHistoryModel.findOne({
        where: { callID: callIDFromCallDetails },
      });
      if (record) {
        await this.safeHomeIVRHistoryModel.update(
          {
            callUUID: uuid,
            callStatus: callStatus,
          },
          {
            where: { callID: callIDFromCallDetails },
          },
        );

        if (digit_pressed === '1') {
          await this.handleSafeHomeConfirmed(record);
        } else if (digit_pressed === '2') {
          await this.handleSafeHomeEscalation(
            record,
            SAFE_HOME_NOT_SAFE_REMARKS,
          );
        }
        return;
      }
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async missedSafeHomeIVR(
    safeHomeIVRResponseDto: SafeHomeIVRResponseDto,
  ): Promise<any> {
    try {
      const {
        call_id,
        // caller_id_number,
        // call_status,
        // digit_pressed,
        // digits_dialed,
      } = safeHomeIVRResponseDto;

      const record = await this.safeHomeIVRHistoryModel.findOne({
        where: { callID: call_id },
      });
      this.logger.log('record  >>>>>  ', record);

      if (!record) {
        this.logger.warn(
          `Safe home IVR: missed-call webhook has no matching history row for call_id ${call_id} — skipping, no context to retry with.`,
        );
        return;
      }

      // A row goes null -> Missed exactly once: every attempt creates a fresh
      // row and each webhook targets its own row by callID. So finding it
      // already Missed means this delivery is a repeat, and without this guard
      // it would arm a second retry timer for the same hangup. Mirrors the same
      // check in handleSafeHomeAnsweredNoResponse, which also makes the two
      // webhook paths mutually exclusive for a given row.
      if (record.callStatus === CallStatus.Missed) {
        this.logger.warn(
          `Safe home IVR: missed-call webhook redelivered for call_id ${call_id} — already recorded, not scheduling another attempt.`,
        );
        return;
      }

      await this.safeHomeIVRHistoryModel.update(
        { callStatus: CallStatus.Missed },
        { where: { callID: call_id } },
      );

      await this.retryOrEscalateSafeHome(record);
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async hasTwoMissedCallsForTripRequest(tripRequestID: any): Promise<boolean> {
    const missedCalls = await this.safeHomeIVRHistoryModel.count({
      where: {
        tripRequestID,
        callStatus: 'Missed', // adjust if your column uses different value
      },
    });

    return missedCalls >= 2;
  }

  /**
   * Places the next attempt on a timer instead of inline.
   *
   * This is reached from a @Public() webhook. Awaiting a 60s sleep would hold
   * the HTTP response open, and Tata retries a callback only twice before
   * dropping it for good — so the gap has to be deferred, never awaited.
   * Returns void rather than a promise so a caller cannot accidentally await it.
   *
   * Failures are swallowed inside the timer: an unhandled rejection in a
   * setTimeout callback takes the process down. Mirrors the pattern in
   * scheduleSafeHomeIvrCheck (driver.trip.services.ts), including its
   * limitation — an in-process timer does not survive a restart, so a retry
   * armed just before a deploy is lost and nothing else will pick it up.
   */
  private scheduleSafeHomeRetry(record: SafeHomeIVRHistory): void {
    setTimeout(async () => {
      try {
        this.logger.log(
          `Safe home IVR: placing the deferred attempt for trip request ${record.tripRequestID}.`,
        );

        await this.executeSafeHomeIVR(record.employeePhone, {
          tripRequestID: record.tripRequestID,
          tripID: record.tripID,
          orgID: record.orgID,
          employeeID: record.employeeID,
        });
      } catch (error: any) {
        this.logger.error(
          `Safe home IVR: deferred attempt for trip request ${record.tripRequestID} failed: ${error?.message}`,
        );
      }
    }, this.SAFE_HOME_RETRY_GAP_MS);
  }

  /**
   * Both no-response outcomes land here: she never picked up, or she picked up
   * and said nothing. Retry until the cap is spent, then escalate exactly once.
   * Shared so the two callers cannot drift apart on the retry policy.
   *
   * record.employeePhone is the number executeSafeHomeIVR dialled when the call
   * was placed. The webhook's call_to_number is the Tata IVR menu number, not
   * the employee — it must never be used to redial.
   */
  private async retryOrEscalateSafeHome(
    record: SafeHomeIVRHistory,
  ): Promise<void> {
    // A count scoped to a null tripRequestID matches every other context-less
    // row in the table (Sequelize renders it IS NULL), so it would reach the cap
    // on unrelated rows and escalate an alert that cannot be attributed.
    if (!record.tripRequestID) {
      this.logger.warn(
        `Safe home IVR: history row ${record.id} has no tripRequestID — cannot count it toward the retry cap or escalate.`,
      );
      return;
    }

    const hasReachedCallCap = await this.hasTwoMissedCallsForTripRequest(
      record.tripRequestID,
    );

    if (hasReachedCallCap) {
      this.logger.warn(
        `Safe home IVR: 2 attempts exhausted for trip request ${record.tripRequestID}`,
      );
      // Escalation stays inline: it is fast, entirely local, and must not be
      // lost to a restart the way a deferred call can be.
      await this.handleSafeHomeEscalation(record, SAFE_HOME_NO_ANSWER_REMARKS);
      return;
    }

    // Deferred, not awaited — the webhook response has to go back to Tata now.
    this.logger.log(
      `Safe home IVR: next attempt for trip request ${
        record.tripRequestID
      } scheduled in ${this.SAFE_HOME_RETRY_GAP_MS / 1000}s.`,
    );
    this.scheduleSafeHomeRetry(record);
  }

  /**
   * Outcome A — she confirmed she reached home safely. Marks the trip request
   * and sends a confirmation mail. No alert and no websocket emit: nothing here
   * needs an admin's attention.
   */
  private async handleSafeHomeConfirmed(
    record: SafeHomeIVRHistory,
  ): Promise<void> {
    const context = await this.loadSafeHomeContext(record);

    await this.updateTripRequestSafeHome(record, true);

    await this.sendSafeHomeEmail({
      record,
      context,
      templateName: 'safe-home-success',
      subject: 'Safe Home Confirmed',
      reason: SAFE_HOME_CONFIRMED_REASON,
      recipientsConfigName: SAFE_HOME_CONFIRMATION_RECIPIENTS_CONFIG,
    });
  }

  /**
   * Outcomes B and C — she reported she is not safe, or never answered at all.
   * Both raise the same alert and template; `remarks` is what distinguishes
   * them on the dashboard.
   *
   * Both mark the trip request not-safe. C used to leave safeHome null on the
   * grounds that "never responded" is not the same fact as "responded that she
   * is not safe" — but once every attempt has been spent, an unconfirmed safe
   * arrival is a negative result rather than an unknown one, and leaving it null
   * hid these behind "Pending" in the safe-home report. The two outcomes stay
   * distinguishable through `remarks` and through digitPressed, which is what
   * deriveStatus keys on.
   *
   * Every side effect is isolated in its own try/catch below. This runs from a
   * @Public() webhook with no user context, so a failing mail server or a dead
   * socket must never fail the webhook response back to Tata.
   */
  private async handleSafeHomeEscalation(
    record: SafeHomeIVRHistory,
    remarks: string,
  ): Promise<void> {
    const context = await this.loadSafeHomeContext(record);

    await this.updateTripRequestSafeHome(record, false);

    const alert = await this.raiseSafeHomeAlert(record, context, remarks);
    this.emitSafeHomeSos(record, context, remarks, alert);

    await this.sendSafeHomeEmail({
      record,
      context,
      templateName: 'safe-home-alert',
      subject: 'Safe Home Alert',
      reason: remarks,
    });
  }

  /**
   * Loads the employee, trip request and trip behind a history row. Each lookup
   * is optional — a missing one degrades the message rather than blocking the
   * escalation, which is the part that actually matters.
   */
  private async loadSafeHomeContext(
    record: SafeHomeIVRHistory,
  ): Promise<SafeHomeNotificationContext> {
    const context: SafeHomeNotificationContext = {
      employee: null,
      tripRequest: null,
      trip: null,
      employeeID: record?.employeeID ?? null,
    };

    try {
      // Loaded before the employee: TripRequest.employeeID is authoritative. The
      // history row's copy is taken from the deboard context at call placement
      // and is null on rows created without one.
      if (record?.tripRequestID) {
        context.tripRequest = await this.tripRequestModel.findOne({
          where: { id: record.tripRequestID },
          attributes: ['id', 'employeeID', 'deboardLocation', 'deboardTime'],
        });
      }

      if (context.tripRequest?.employeeID) {
        // A disagreement means this row was resolved to the wrong call. It
        // cannot be corrected from here — the trip request came off the same
        // suspect row — but it is otherwise completely silent.
        if (
          record?.employeeID &&
          String(context.tripRequest.employeeID) !== String(record.employeeID)
        ) {
          this.logger.error(
            `Safe home IVR: history row ${record.id} carries employeeID ${record.employeeID} but trip request ${record.tripRequestID} belongs to ${context.tripRequest.employeeID} — trusting the trip request.`,
          );
        }

        context.employeeID = context.tripRequest.employeeID;
      }

      if (context.employeeID) {
        context.employee = await this.employeeModel.findOne({
          where: { id: context.employeeID },
          attributes: ['id', 'name', 'employeeCode'],
        });
      }

      // driverID and vendorID are not on the history row; the trip is the only
      // place to get them for the alert.
      if (record?.tripID) {
        context.trip = await this.tripModel.findOne({
          where: { id: record.tripID },
          attributes: ['id', 'driverID', 'vendorID'],
        });
      }
    } catch (error: any) {
      this.logger.error(
        `Safe home IVR: failed to load notification context for history row ${record?.id}: ${error?.message}`,
      );
    }

    return context;
  }

  private async updateTripRequestSafeHome(
    record: SafeHomeIVRHistory,
    safeHome: boolean,
  ): Promise<void> {
    try {
      if (!record?.tripRequestID) {
        this.logger.warn(
          `Safe home IVR: history row ${record?.id} has no tripRequestID — cannot record the safe home outcome.`,
        );
        return;
      }

      await this.tripRequestModel.update(
        {
          safeHome,
          safeHomeTime: moment().format('YYYY-MM-DD HH:mm:ss'),
        },
        { where: { id: record.tripRequestID } },
      );
    } catch (error: any) {
      this.logger.error(
        `Safe home IVR: failed to update safeHome on trip request ${record?.tripRequestID}: ${error?.message}`,
      );
    }
  }

  /**
   * Mirrors validateDeboardDeviation's direct alertModel.create — there is no
   * `user` object on a webhook, so none of the createXAlert helpers apply.
   */
  private async raiseSafeHomeAlert(
    record: SafeHomeIVRHistory,
    context: SafeHomeNotificationContext,
    remarks: string,
  ): Promise<Alert | null> {
    try {
      // Alert.tripID and Alert.orgID are both NOT NULL. Without them the row
      // would be rejected by the DB anyway, so skip rather than write a
      // half-formed alert. The email still goes out — it carries the same
      // information and does not depend on the trip.
      if (!record?.tripID || !record?.orgID) {
        this.logger.warn(
          `Safe home IVR: history row ${record?.id} is missing tripID or orgID — skipping the alert row and the websocket emit. The email is still sent.`,
        );
        return null;
      }

      const employeeLabel = context.employee?.name
        ? ` Employee: ${context.employee.name}${
            context.employee.employeeCode
              ? ` (${context.employee.employeeCode})`
              : ''
          }.`
        : '';
      const tripRequestLabel = record?.tripRequestID
        ? ` Trip Request ID: ${record.tripRequestID}.`
        : '';

      const alertData = {
        location:
          context.tripRequest?.deboardLocation ||
          SAFE_HOME_LOCATION_UNAVAILABLE,
        remarks: `${remarks}${employeeLabel}${tripRequestLabel}`,
        tripID: record.tripID,
        tripRequestID: record.tripRequestID ?? null,
        orgID: record.orgID,
        source: 'System Generated',
        type: 'sos',
        status: ReadStatus.Pending,
        driverID: context.trip?.driverID ?? null,
        employeeID: context.employeeID ?? record.employeeID ?? null,
        vendorID: context.trip?.vendorID ?? null,
      };

      return await this.alertModel.create(alertData);
    } catch (error: any) {
      this.logger.error(
        `Safe home IVR: failed to create the alert for history row ${record?.id}: ${error?.message}`,
      );
      return null;
    }
  }

  /**
   * Payload mirrors the shape createDriverAlert emits, so the dashboard's
   * existing 'sos-alert' listener needs no change.
   */
  private emitSafeHomeSos(
    record: SafeHomeIVRHistory,
    context: SafeHomeNotificationContext,
    remarks: string,
    alert: Alert | null,
  ): void {
    try {
      // No alert row means no alertId to hand the dashboard, and the listener
      // resolves the row by that id — emitting would surface an alert the
      // admin cannot open.
      if (!alert) {
        this.logger.warn(
          `Safe home IVR: no alert row for history row ${record?.id} — skipping the websocket emit.`,
        );
        return;
      }

      this.sosGateway.emitSosAlert(String(record.orgID), {
        alertId: String(alert.id),
        source: 'System Generated',
        location:
          context.tripRequest?.deboardLocation ||
          SAFE_HOME_LOCATION_UNAVAILABLE,
        remarks,
        tripID: record.tripID,
        orgID: String(record.orgID),
        createdAt: new Date().toISOString(),
      });
    } catch (error: any) {
      this.logger.error(
        `Safe home IVR: failed to emit the SOS socket event for history row ${record?.id}: ${error?.message}`,
      );
    }
  }

  /**
   * Reads a comma-separated recipients config, returning [] for every "no usable
   * value" outcome so callers can fall back on one condition. getConfigValue has
   * three of them: it throws when the master config row is absent, returns null
   * when the row exists but the org has no value and no default, and returns a
   * blank string when the value is set but empty.
   */
  private async readSafeHomeRecipients(
    configName: string,
    orgID: any,
  ): Promise<string[]> {
    try {
      const value = await this.configurationService.getConfigValue(
        configName,
        orgID,
      );

      return (value || '')
        .split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0);
    } catch (error: any) {
      this.logger.warn(
        `Safe home IVR: config '${configName}' unavailable for org ${orgID}: ${error?.message}`,
      );
      return [];
    }
  }

  /**
   * Sends to the recipients config the caller names, defaulting to the org's
   * 'SOS Email Alert Recipients'. Deliberately does not go through
   * AlertService.sendSosNotifications — there the email block sits inside the
   * SMS block and is skipped whenever SMS recipients are unset.
   */
  private async sendSafeHomeEmail(input: {
    record: SafeHomeIVRHistory;
    context: SafeHomeNotificationContext;
    templateName: string;
    subject: string;
    reason: string;
    recipientsConfigName?: string;
  }): Promise<void> {
    const {
      record,
      context,
      templateName,
      subject,
      reason,
      recipientsConfigName,
    } = input;

    try {
      const primaryConfigName =
        recipientsConfigName || SAFE_HOME_SOS_RECIPIENTS_CONFIG;

      let recipients = await this.readSafeHomeRecipients(
        primaryConfigName,
        record?.orgID,
      );
      let usedConfigName = primaryConfigName;

      // The confirmation list is optional. Until an admin creates that row, a
      // safe confirmation still goes somewhere rather than being dropped.
      if (
        recipients.length === 0 &&
        primaryConfigName !== SAFE_HOME_SOS_RECIPIENTS_CONFIG
      ) {
        this.logger.warn(
          `Safe home IVR: no '${primaryConfigName}' configured for org ${record?.orgID} — falling back to '${SAFE_HOME_SOS_RECIPIENTS_CONFIG}' for the ${templateName} email.`,
        );

        recipients = await this.readSafeHomeRecipients(
          SAFE_HOME_SOS_RECIPIENTS_CONFIG,
          record?.orgID,
        );
        usedConfigName = SAFE_HOME_SOS_RECIPIENTS_CONFIG;
      }

      if (recipients.length === 0) {
        this.logger.warn(
          `Safe home IVR: no '${usedConfigName}' configured for org ${record?.orgID} — skipping the ${templateName} email.`,
        );
        return;
      }

      const deboardLocation = context.tripRequest?.deboardLocation;

      // Stored as a local-time 'YYYY-MM-DD HH:mm:ss' string
      // (driver.trip.services.ts:881). Reformat for display only — no timezone
      // conversion. Unparseable values fall through to the raw string rather
      // than being hidden.
      const rawDeboardTime = context.tripRequest?.deboardTime;
      const parsedDeboardTime = rawDeboardTime
        ? moment(rawDeboardTime, 'YYYY-MM-DD HH:mm:ss')
        : null;
      const deboardTime = parsedDeboardTime?.isValid()
        ? parsedDeboardTime.format('DD-MM-YYYY HH:mm:ss')
        : rawDeboardTime || 'N/A';

      // The templates read every key unconditionally, so each one must be
      // present — an undefined local is a ReferenceError inside EJS.
      await this.emailService.sendEmail({
        mailTo: recipients,
        subject,
        templateName,
        mailBody: {
          employeeName: context.employee?.name || 'Unknown',
          employeeCode: context.employee?.employeeCode || 'N/A',
          reason,
          tripRequestID: record?.tripRequestID
            ? String(record.tripRequestID)
            : 'N/A',
          tripID: record?.tripID ? String(record.tripID) : 'N/A',
          deboardTime,
          mapLink: deboardLocation
            ? `https://maps.google.com/?q=${deboardLocation}`
            : '',
        },
        isAttachments: false,
        attachments: [],
      });
    } catch (error: any) {
      this.logger.error(
        `Safe home IVR: failed to send the ${templateName} email for history row ${record?.id}: ${error?.message}`,
      );
    }
  }

  async getCallDetails(apiEndPoint) {
    try {
      const response = await axios.get(
        `${this.apiConfig.baseURL}/call/records?call_id=${apiEndPoint}`,
        {
          headers: {
            accept: 'application/json',
            Authorization: this.configService.get('IVR_CALL_DETAILS_TOKEN'),
            'content-type': 'application/json',
          },
        },
      );
      // this.logger.log('API Response:', response.data);
      return response?.data;
    } catch (error: any) {
      this.logger.error(
        'API Error:',
        error.response ? error.response.data : error.message,
      );
      throw error;
    }
  }

  async updateIVRCallStatus(payload: any) {
    try {
      const history = await this.safeHomeIVRHistoryModel.findOne({
        where: {
          refID: payload?.ref_id,
        },
      });

      if (!history) {
        this.logger.warn(`IVR history not found for refID: ${payload?.ref_id}`);
        return;
      }

      const duration = Number(payload.duration || 0);

      // Billing is best-effort. getConfigValue throws when the master config row
      // is absent, and a present-but-malformed value ("30", "0,1.25") yields
      // NaN/Infinity that the DECIMAL/INTEGER columns reject. Either way the call
      // itself must still be persisted: recording and duration are what the
      // safe-home flow needs, cost is incidental to it.
      let callCost: number | null = null;
      let callCount: number | null = null;

      try {
        const ivrCallRate = await this.configurationService.getConfigValue(
          'IVR_CALL_COST',
          history.orgID,
        );

        // Example: "30,1.25"
        const [billingSeconds, costForBillingSeconds] = String(
          ivrCallRate ?? '',
        )
          .split(',')
          .map(Number);

        if (
          Number.isFinite(billingSeconds) &&
          billingSeconds > 0 &&
          Number.isFinite(costForBillingSeconds)
        ) {
          // Charge every started interval (partial interval = full interval)
          callCount = duration > 0 ? Math.ceil(duration / billingSeconds) : 0;

          // Total call cost = number of billed intervals × cost per interval
          callCost = Number((callCount * costForBillingSeconds).toFixed(2));
        } else {
          this.logger.warn(
            `IVR_CALL_COST is malformed for org ${history.orgID} ("${ivrCallRate}") — persisting the call without billing.`,
          );
        }
      } catch (error: any) {
        this.logger.warn(
          `IVR_CALL_COST unavailable for org ${history.orgID}: ${error?.message} — persisting the call without billing.`,
        );
      }

      const updateData: any = {};
      updateData.callDuration = payload?.duration;
      updateData.recordingUrl = payload?.recording_url;
      // updateData.callStatus = 'Answered';
      updateData.callCount = callCount;
      updateData.callCost = callCost;

      // callID, callStatus and callUUID belong to the safe-home flow: the DTMF
      // handler writes the digit outcome into callStatus, and missedSafeHomeIVR
      // resolves retries by the click-to-call callID. This webhook reports a
      // different leg in Tata's own status vocabulary, so overwriting them would
      // downgrade a "pressed 2" row to "Not Safe - No Answer" in the safe-home
      // report and break the retry lookup. Every other call type is unaffected.
      if (history.callType !== 'SAFE_HOME') {
        updateData.callID = payload?.call_id;
        updateData.callStatus = payload?.status;
        updateData.callUUID = payload?.uuid;
      }

      await this.safeHomeIVRHistoryModel.update(updateData, {
        where: {
          refID: payload.ref_id,
        },
      });

      if (history.callType === 'SAFE_HOME') {
        await this.handleSafeHomeAnsweredNoResponse(payload, history);
      }
    } catch (error: any) {
      // Never throw back to Tata. A 500 buys two retries and then the callback —
      // and with it the recording, the duration and the only signal that a call
      // was answered in silence — is lost for good. Applies to every call type.
      this.logger.error(
        `updateIVRCallStatus failed for refID ${payload?.ref_id}: ${
          error?.message ?? error
        }`,
      );
    }
  }

  /**
   * Outcome D — she picked up and never pressed anything. Smartflo reports this
   * as call_status "Answered" with an empty digit and a NO_USER_RESPONSE /
   * NO_ANSWER hangup cause, so it never fires the missed-call webhook, and
   * safeHomeDtmfDialplan only logs it. Left alone the row sits Answered with a
   * null digit: it no longer matches resolveSafeHomeRecord's pending filter and
   * it never counts toward the retry cap, so safeHome stays null forever and the
   * report reads Pending indefinitely.
   *
   * Recorded as Missed so hasTwoMissedCallsForTripRequest keeps working entirely
   * untouched and the report resolves to "Not Safe - No Answer". The evidence
   * that the call did connect is not lost — callDuration and recordingUrl were
   * just written to this same row.
   *
   * Deliberately scoped to call_status "Answered": a genuinely missed call is
   * already handled by missedSafeHomeIVR, and acting on it here too would place
   * a second redial for the same hangup.
   */
  private async handleSafeHomeAnsweredNoResponse(
    payload: any,
    history: SafeHomeIVRHistory,
  ): Promise<void> {
    const callStatus = String(payload?.call_status ?? payload?.status ?? '');

    if (callStatus.trim().toLowerCase() !== 'answered') {
      // Logged rather than silently skipped: the exact status vocabulary Tata
      // sends on this webhook is only observable in UAT, and if answered-silent
      // calls arrive under some other label this line is where it shows up.
      this.logger.log(
        `Safe home IVR: hangup for history row ${history.id} reported status "${callStatus}" (hangup cause: ${payload?.hangup_cause}) — not treated as a non-response.`,
      );
      return;
    }

    // Re-read. The DTMF webhook lands mid-call and this one lands after it, but
    // they are independent deliveries — a digit that arrived while this handler
    // was running must not be misread as silence.
    const record = await this.safeHomeIVRHistoryModel.findOne({
      where: { id: history.id },
    });

    // Only 1 and 2 answer the question. Any other key is as much a non-response
    // as silence, and safeHomeDtmfDialplan stores it verbatim for forensics.
    if (!record || record.digitPressed === '1' || record.digitPressed === '2') {
      return;
    }

    // Already counted; the call-status webhook can be delivered more than once.
    if (record.callStatus === CallStatus.Missed) {
      return;
    }

    this.logger.warn(
      `Safe home IVR: history row ${record.id} was answered with no response (hangup cause: ${payload?.hangup_cause}) — recording it as a non-response.`,
    );

    await this.safeHomeIVRHistoryModel.update(
      { callStatus: CallStatus.Missed },
      { where: { id: record.id } },
    );

    // Recorded as Missed above, so from here this is the same decision a
    // never-answered call makes — retry until the cap, then escalate once.
    await this.retryOrEscalateSafeHome(record);
  }

  async connectEmployeeToHelpdesk(user: any): Promise<any> {
    try {
      const employeeData = await this.employeeService.findOne(
        user?.employeeID,
        user,
      );
      const employeePhone = employeeData?.data?.phone;

      if (!employeePhone) {
        throw new NotFoundException(
          'Employee phone number not found. Please verify and try again.',
        );
      }

      const helpdeskConfigValue =
        await this.configurationService.getConfigValue(
          'Helpdesk IVR',
          user?.orgID,
        );

      if (!helpdeskConfigValue) {
        throw new NotFoundException(
          'Helpdesk IVR configuration is not set up for your organization.',
        );
      }

      const helpdeskNumber =
        this.resolveHelpdeskNumberForCurrentTime(helpdeskConfigValue);

      if (!helpdeskNumber) {
        throw new BadRequestException(
          'Current time range is missing in the config.',
        );
      }

      const payload = {
        async: 1,
        agent_number: employeePhone,
        destination_number: helpdeskNumber,
        caller_id: 918069601600,
        get_call_id: 1,
      };

      const callRes = await this.clickToCall('click_to_call', payload, user);

      const ivrInput = {
        orgID: user?.orgID,
        employeeID: user?.employeeID,
        employeePhone,
        helpdeskPhone: helpdeskNumber,
        refID: callRes?.ref_id,
        callID: callRes?.call_id,
        callType: 'EMPLOYEE_TO_HELPDESK',
        callStatus: 'Queued',
        date: new Date(),
      };
      await this.safeHomeIVRHistoryModel.create(ivrInput);

      return {
        message: `Call initiated. Please hold while we connect you.`,
        data: null,
      };
    } catch (error: any) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Parses a config string like:
   * "09:00-17:00=8921474048,17:00-00:00=9746113379"
   * and returns the phone number for whichever range contains the current time.
   * A range ending at "00:00" is treated as running to end-of-day (no upper bound),
   * per requirement: day rollover is not a concern, only the time-of-day matters.
   */
  private resolveHelpdeskNumberForCurrentTime(
    configValue: string,
  ): string | null {
    const now = moment().format('HH:mm');
    const ranges = configValue.split(',').map((r) => r.trim());

    for (const range of ranges) {
      const [timeRange, phoneNumber] = range.split('=').map((s) => s?.trim());
      if (!timeRange || !phoneNumber) {
        continue;
      }
      const [start, end] = timeRange.split('-').map((s) => s?.trim());
      if (!start || !end) {
        continue;
      }

      const matchesOpenEnded = end === '00:00' && now >= start;
      const matchesBounded = end !== '00:00' && now >= start && now < end;

      if (matchesOpenEnded || matchesBounded) {
        return phoneNumber;
      }
    }

    return null;
  }
}
