import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as moment from 'moment';
import { InjectModel } from '@nestjs/sequelize';
import {
  EmployeeType,
  EndPoint,
  SortOrder,
  Status,
  TripStatus,
  UserType,
} from 'src/shared/enums';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { uniqueFieldsCheck } from 'src/shared/utils/unique-validation';

import { CreateEmployeeInput } from '../dtos/create-employee-input.dto';
import { UpdateEmployeeInput } from '../dtos/update-employee-input.dto';
import { EmployeeFilterInput } from '../dtos/employee-filter-input.dto';
import { Employee } from '../models/employee.model';
import { handleErrors } from 'src/shared/utils/format-exception';
import { ProfileService } from 'src/profile/service/profile.service';
import { Op, Transaction } from 'sequelize';
import { Profile } from 'src/profile/model/profile.model';
import { Role } from 'src/role/models/role.model';
import { Process } from 'src/process/models/process.model';
import { Team } from 'src/team/models/team.model';
import { AuthService } from 'src/auth/services/auth.service';
import { Authentication } from 'src/auth/models/authentication.model';
import { Location } from 'src/location-management/locations/models/location.model';
import { CommonPoint } from 'src/location-management/commonPoints/models/commonPoint.model';
import { Organization } from 'src/organization/models/organization.model';
import { EventLogService } from 'src/eventlog/eventlog.service';
import { GoogleMapsService } from 'src/google-maps/services/google-map-service';
import { OrganizationService } from 'src/organization/services/organization.service';
import * as XLSX from 'xlsx';
import { Sequelize } from 'sequelize-typescript';
import { EmployeeListFilterInput } from '../dtos/employeeList-filter-input.dto ';
import { Trip } from 'src/trip-management/trip/models/trip.model';
import { TripRequest } from 'src/trip-management/trip-request/models/trip-request.model';
import { ApprovalRequest } from 'src/approval-request/models/approval-request.model';
import { Costcenter } from 'src/costcenter/model/costcenter.model';
import { SessionService } from 'src/auth/services/session.service';
import { ConfigurationService } from 'src/config-management/config/services/config.service';
import { EmailService } from 'src/email/email.service';
import { ConfigService } from '@nestjs/config';
import { AdministratorService } from 'src/administrator/services/administrator.service';
import { SetSecurityPinDto } from 'src/profile/dtos/set-security-pin-input.dto';
import { EmployeeDeviceInfo } from 'src/auth/models/employee-device-model';

interface IZoneRow {
  locationId: number;
  employeeCode: string;
  sequence: number;
}

@Injectable()
export class EmployeeService {
  private logger = new Logger(EmployeeService.name);

  constructor(
    @InjectModel(Trip)
    private tripModel: typeof Trip,
    @InjectModel(Employee)
    private employeeModel: typeof Employee,
    @InjectModel(Profile)
    private profileModel: typeof Profile,
    @InjectModel(Team)
    private teamModel: typeof Team,
    @InjectModel(Role)
    private roleModel: typeof Role,
    @InjectModel(Process)
    private processModel: typeof Process,
    private profileService: ProfileService,
    private administratorService: AdministratorService,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
    @InjectModel(Authentication)
    private authModel: typeof Authentication,
    @InjectModel(TripRequest)
    private tripRequestModel: typeof TripRequest,
    @InjectModel(Location)
    private locationModel: typeof Location,
    @InjectModel(CommonPoint)
    private commonPointModel: typeof CommonPoint,
    @InjectModel(Costcenter)
    private costcenterModel: typeof Costcenter,
    private eventlogService: EventLogService,
    private googleMapsService: GoogleMapsService,
    private orgService: OrganizationService,
    private readonly sequelize: Sequelize,
    private sessionService: SessionService,
    private organizationService: OrganizationService,
    @InjectModel(ApprovalRequest)
    private approvalRequestModel: typeof ApprovalRequest,
    private configurationService: ConfigurationService,
    private emailService: EmailService,
    private config: ConfigService,
  ) {}

  //   async create(
  //     createEmployeeInput: CreateEmployeeInput,
  //     password?: string,
  //     currentUser?: any,
  //     passedTransaction?: Transaction,
  //   ): Promise<GenericResponse<Employee>> {
  //     try {
  //       const transaction =
  //         passedTransaction ?? (await this.sequelize.transaction());
  //       const validationErrors = await uniqueFieldsCheck(
  //         this.employeeModel,
  //         ['email', 'phone', 'employeeCode'],
  //         createEmployeeInput,
  //         null,
  //         currentUser?.orgID,
  //       );

  //       handleErrors(validationErrors, 'unique');
  //       if (!createEmployeeInput.exitDate) {
  //         createEmployeeInput.exitDate = null;
  //       }

  //       // findOrgGeoCode
  //       const org = await this.orgService.findOne(
  //         createEmployeeInput.orgID
  //           ? createEmployeeInput.orgID
  //           : currentUser?.orgID,
  //         transaction,
  //       );
  //       const orgGeoCode = org?.data?.geoCode;
  //       let commutedDistance = {
  //         distance: null,
  //         time: null,
  //       };
  //       if (createEmployeeInput.homePoint && orgGeoCode) {
  //         commutedDistance = await this.googleMapsService.getDistance(
  //           orgGeoCode,
  //           createEmployeeInput.homePoint,
  //         );
  //       }

  //       const employees = await this.employeeModel.create(
  //         {
  //           ...createEmployeeInput,
  //           orgID: createEmployeeInput.orgID ?? currentUser?.orgID,
  //           commuteDistance: commutedDistance.distance,
  //           commuteTime: commutedDistance.time,
  //         },
  //         { transaction },
  //       );
  //       const eventPayload = JSON.parse(JSON.stringify(createEmployeeInput));
  //       const eventLog = {
  //         objectType: 'Employee',
  //         changeType: 'add',
  //         objectID: employees.id,
  //         authID: currentUser.id,
  //         orgID: currentUser?.orgID,
  //         updatedBy: currentUser.name,
  //         payload: employees,
  //         requestPayload: eventPayload,
  //       };
  //       this.eventlogService.create(eventLog);
  //       if (employees) {
  //         const profileInput = {
  //           dob: createEmployeeInput.dob,
  //           address: createEmployeeInput.address,
  //           homePoint: createEmployeeInput.homePoint,
  //           bloodGroup: createEmployeeInput.bloodGroup,
  //           emergencyContactNo: createEmployeeInput.emergencyContactNo,
  //           emergencyContactName: createEmployeeInput.emergencyContactName,
  //           employeeID: employees.id,
  //         };

  //         await this.profileService.create(profileInput, transaction);

  //         const authInput = {
  //           phone: employees?.phone,
  //           email: employees?.email,
  //           // userType: UserType.Employee,
  //           userType: UserType.Employee,
  //           status: Status.Active,
  //           password: password ?? null,
  //           passwordCreatedAt: password ? new Date() : null,
  //           employeeID: employees.id,
  //           name: employees?.name,
  //         };
  //         const authUser = await this.authService.create(authInput, transaction);

  //         if (currentUser?.userType !== UserType.SuperAdmin) {
  //           await this.authService.generateResetPasswordLinkAndSendMail(
  //             authUser?.id?.toString(),
  //             {
  //               ...authUser?.[
  //                 authUser.userType === UserType.Admin ? 'admin' : 'Vendor'
  //               ]?.dataValues,
  //               email: authUser?.email,
  //             },
  //             authUser.userType,
  //             'email-verification',
  //             authUser?.email,
  //             employees?.employeeType === EmployeeType.Employee
  //               ? EndPoint.Employee
  //               : EndPoint.Admin,
  //             transaction,
  //           );
  //         }
  //         await transaction.commit();
  //       }

  //       return {
  //         message: 'Employee created successfully',
  //         data: employees,
  //       };
  //     } catch (error) {
  //       if (error.status !== 500) {
  //         throw error;
  //       }
  //       throw new InternalServerErrorException(error);
  //     }
  //   }
  async create(
    createEmployeeInput: CreateEmployeeInput,
    password?: string,
    currentUser?: any,
    passedTransaction?: Transaction,
  ): Promise<GenericResponse<Employee>> {
    const transaction =
      passedTransaction ?? (await this.sequelize.transaction());

    try {
      const validationErrors = await uniqueFieldsCheck(
        this.employeeModel,
        ['email', 'phone', 'employeeCode'],
        createEmployeeInput,
        null,
        currentUser?.orgID,
      );
      handleErrors(validationErrors, 'unique');

      if (!createEmployeeInput.exitDate) {
        createEmployeeInput.exitDate = null;
      }

      const org = await this.orgService.findOne(
        createEmployeeInput.orgID
          ? createEmployeeInput.orgID
          : currentUser?.orgID,
        transaction,
      );
      const orgGeoCode = org?.data?.geoCode;

      let commutedDistance = { distance: null, time: null };
      if (createEmployeeInput.homePoint && orgGeoCode) {
        commutedDistance = await this.googleMapsService.getDistance(
          orgGeoCode,
          createEmployeeInput.homePoint,
        );
      }

      const employees = await this.employeeModel.create(
        {
          ...createEmployeeInput,
          orgID: createEmployeeInput.orgID ?? currentUser?.orgID,
          commuteDistance: commutedDistance.distance,
          commuteTime: commutedDistance.time,
        },
        { transaction },
      );

      // Formats a date as DD/MM/YYYY, date-only.
      const formatDateOnly = (value: any): any => {
        if (!value) return value;
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      };

      const eventPayload = JSON.parse(JSON.stringify(createEmployeeInput));
      // Payload is the raw employees model instance — joinedDate rendered
      // as the raw YYYY-MM-DD string since the payloadJSON table only
      // special-cases a field literally named "date", not "joinedDate".
      // Formatted before logging without mutating the real employees
      // record used elsewhere in this function.
      const employeeForLog: Record<string, any> = {
        ...employees.get({ plain: true }),
        joinedDate: formatDateOnly(employees.joinedDate),
      };
      delete employeeForLog.sortOrder;
      // Resolves teamID/processID/commonPointID/reportingID/locationID
      // (and roleID) to their display names in place — same helper
      // already used further down for the Transport Team email alert.
      // Reused here so the log shows "Team", "Zone", "Reporting
      // Manager" etc. instead of raw foreign-key IDs. This mutates
      // employeeForLog by DELETING the ID key and adding a differently
      // named label key (e.g. teamID -> team), so field labels in the
      // log also change (e.g. "Team ID" -> "Team", "Location ID" ->
      // "Zone", "Reporting ID" -> "Reporting Manager").
      await this.resolveForeignKeyNamesInDiff({}, employeeForLog);
      const isTransportTeam =
        (employees.employeeType as string) === UserType.Transport;
      const eventLog = {
        objectType: 'Employee',
        changeType: 'add',
        objectID: employees.id,
        authID: currentUser.id,
        orgID: currentUser?.orgID,
        updatedBy: currentUser.name,
        payload: employeeForLog,
        requestPayload: eventPayload,
        customDescription: isTransportTeam
          ? 'created new Transport Team Employee'
          : 'created new Employee',
        user: currentUser,
      };
      // await this.eventlogService.create(eventLog, transaction);

      if (employees) {
        const profileInput = {
          dob: createEmployeeInput.dob,
          address: createEmployeeInput.address,
          homePoint: createEmployeeInput.homePoint,
          bloodGroup: createEmployeeInput.bloodGroup,
          emergencyContactNo: createEmployeeInput.emergencyContactNo,
          emergencyContactName: createEmployeeInput.emergencyContactName,
          employeeID: employees.id,
        };
        // await this.profileService.create(profileInput, transaction);

        const authInput = {
          phone: employees?.phone,
          email: employees?.email,
          userType: UserType.Employee,
          status: Status.Active,
          password: password ?? null,
          passwordCreatedAt: password ? new Date() : null,
          employeeID: employees.id,
          name: employees?.name,
        };
        // const authUser = await this.authService.create(authInput, transaction);

        const [, , authUser] = await Promise.all([
          this.eventlogService.create(eventLog, transaction),
          this.profileService.create(profileInput, transaction),
          this.authService.create(authInput, transaction),
        ]);

        if (currentUser?.userType !== UserType.SuperAdmin) {
          await this.authService.generateResetPasswordLinkAndSendMail(
            authUser?.id?.toString(),
            {
              ...authUser?.[
                authUser.userType === UserType.Admin ? 'admin' : 'Vendor'
              ]?.dataValues,
              email: authUser?.email,
              name: createEmployeeInput?.name,
            },
            authUser.userType,
            'email-verification',
            authUser?.email,
            employees?.employeeType === EmployeeType.Employee
              ? EndPoint.Employee
              : EndPoint.Admin,
            transaction,
          );
        }
      }

      // --- Transport Team creation alert ---
      if ((employees.employeeType as string) === UserType.Transport) {
        const excludedFields = [
          'id',
          'createdAt',
          'updatedAt',
          'orgID',
          'commuteDistance',
          'commuteTime',
        ];

        const newRecord: Record<string, any> = {};
        Object.keys(createEmployeeInput).forEach((key) => {
          if (excludedFields.includes(key)) return;
          const val = (createEmployeeInput as Record<string, any>)[key];
          if (val !== undefined && val !== null && val !== '') {
            newRecord[key] =
              typeof val === 'object' ? JSON.stringify(val) : val;
          }
        });
        // Resolve foreign-key IDs to display names
        await this.resolveForeignKeyNamesInDiff({}, newRecord);

        // Format date fields
        this.formatDatesInDiff(newRecord);

        this.sendEmployeeProfileChangeEmail({
          employeeName: employees.name,
          employeeCode: employees.employeeCode,
          oldRecord: {},
          newRecord,
          orgID: currentUser?.orgID,
          updatedByUsername: currentUser?.email || currentUser?.name,
          changeType: 'created',
        });
      }

      // ✅ Only commit if this service started the transaction
      if (!passedTransaction) {
        await transaction.commit();
      }

      return {
        message: 'Employee created successfully',
        data: employees,
      };
    } catch (error) {
      if (!passedTransaction) {
        await transaction.rollback();
      }
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async importEmployees(file: Buffer, user: any): Promise<object> {
    try {
      this.logger.log('import service---', file);
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
      });

      if (!sheetData?.length) {
        throw new BadRequestException('The Excel file is empty.');
      }

      const employeeCount = sheetData.length - 1; // Subtract 1 for header row
      if (employeeCount > 1200) {
        throw new BadRequestException(
          `You cannot upload more than 200 employees at once. Your file contains ${employeeCount} employees.`,
        );
      }

      const headers = sheetData[0] as string[];
      const requiredHeaders = [
        'Name',
        'EmployeeCode',
        'Gender',
        'Phone',
        'Email',
        'Address',
        'Landmark',
        'SpecialConsideration',
        'HomePoint',
      ];
      const missingHeaders = requiredHeaders.filter(
        (header) => !headers.includes(header),
      );

      if (missingHeaders.length > 0) {
        throw new BadRequestException(
          `The Excel file is missing the following required headers: ${missingHeaders.join(
            ', ',
          )}.`,
        );
      }

      const sheetDataObjects: any = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        { raw: false },
      );

      if (!sheetDataObjects?.length) {
        throw new BadRequestException(
          'The Excel file contains no valid data rows.',
        );
      }

      let validatedData: any = null;
      try {
        validatedData = await this.validateEmployeeSheetData(
          sheetDataObjects,
          user,
        );
      } catch (error) {
        throw new BadRequestException(
          `Data validation failed: ${error.message}`,
        );
      }
      try {
        const existingRecords = await this.authModel.findAll({
          where: {
            [Op.or]: [
              { phone: { [Op.in]: validatedData.map((data) => data.phone) } },
              { email: { [Op.in]: validatedData.map((data) => data.email) } },
            ],
          },
        });
        if (existingRecords.length > 0) {
          const duplicateDetails = existingRecords.map((record) => {
            const fields = [];
            if (validatedData.some((data) => data.phone === record.phone))
              fields.push(`Phone: ${record.phone}`);
            if (validatedData.some((data) => data.email === record.email))
              fields.push(`Email: ${record.email}`);
            return fields.join(', ');
          });
          throw new BadRequestException(
            `The following records already exist:\n${duplicateDetails.join(
              '\n',
            )}`,
          );
        }

        // Create employees in bulk
      } catch (error) {
        throw new BadRequestException(`Import failed: ${error}`);
      }

      const transaction = await this.sequelize.transaction();
      try {
        const createEmployees = await this.employeeModel.bulkCreate(
          validatedData.map((data) => ({
            name: data.name,
            employeeCode: data.employeeCode,
            phone: data.phone,
            email: data.email,
            address: data.address,
            gender: data.gender,
            designation: data.designation,
            landmark: data.landmark,
            specialConsideration: data.specialConsideration,
            homePoint: data.homePoint,
            orgID: data.orgID,
            status: Status.Active,
            employeeType: EmployeeType.Employee,
          })),
          { transaction },
        );

        const profileData: any = createEmployees.map((employee) => {
          return {
            address: employee.address,
            employeeID: employee.id,
          };
        });

        // const  profile = await this.profileModel.bulkCreate(profileData, {transaction});
        await this.profileModel.bulkCreate(profileData, { transaction });
        const authData: any = createEmployees.map((employee) => {
          return {
            phone: employee.phone,
            email: employee.email,
            userType: UserType.Employee,
            status: Status.Active,
            password: null,
            passwordCreatedAt: new Date(),
            employeeID: employee.id,
            name: employee.name,
          };
        });
        const authUser = await this.authModel.bulkCreate(authData, {
          transaction,
        });
        await transaction.commit();
        await Promise.all(
          authUser.map((user) =>
            this.authService.generateResetPasswordLinkAndSendMail(
              user.id.toString(),
              {
                ...user,
                email: user.email,
                name: user.name,
              },
              user.userType,
              'email-verification',
              user.email,
              EndPoint.Employee,
            ),
          ),
        );
        return {
          message: `${createEmployees.length} Employees were created successfully.`,
          data: createEmployees,
        };
      } catch (error) {
        await transaction.rollback();
        throw new BadRequestException(`Import failed: ${error.message}`);
      }
    } catch (error) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }
  // private async validateEmployeeSheetData(
  //   sheetData: any[],
  //   user: any,
  // ): Promise<any[]> {
  //   try {
  //     const employeeCodes = sheetData.map((row) => row.EmployeeCode);
  //     const phoneNumbers = sheetData.map((row) => row.Phone);
  //     const emails = sheetData.map((row) => row.Email);

  //     const findDuplicates = (arr: string[]) =>
  //       arr.filter((item, index) => arr.indexOf(item) !== index);

  //     const duplicateEmployeeCodes = findDuplicates(employeeCodes);
  //     const duplicatePhones = findDuplicates(phoneNumbers);
  //     const duplicateEmails = findDuplicates(emails);
  //     const validatedData: any[] = [];

  //     if (duplicateEmployeeCodes.length > 0) {
  //       throw new Error(
  //         `Duplicate employee codes found in the import file: ${duplicatePhones.join(
  //           ', ',
  //         )}`,
  //       );
  //     }
  //     if (duplicatePhones.length > 0) {
  //       throw new Error(
  //         `Duplicate phone numbers found in the import file: ${duplicatePhones.join(
  //           ', ',
  //         )}`,
  //       );
  //     }
  //     if (duplicateEmails.length > 0) {
  //       throw new Error(
  //         `Duplicate emails found in the import file: ${duplicatePhones.join(
  //           ', ',
  //         )}`,
  //       );
  //     }
  //     const existingRecords = await this.employeeModel.findAll({
  //       where: {
  //         orgID: user.orgID,
  //         [Op.or]: [
  //           { phone: { [Op.in]: phoneNumbers } },
  //           { employeeCode: { [Op.in]: employeeCodes } },
  //           { email: { [Op.in]: emails } },
  //         ],
  //       },
  //     });

  //     if (existingRecords.length > 0) {
  //       const duplicateDetails = existingRecords.map((record) => {
  //         const fields = [];
  //         if (phoneNumbers.includes(record.phone))
  //           fields.push(`Phone: ${record.phone}`);
  //         if (employeeCodes.includes(record.employeeCode))
  //           fields.push(`EmployeeCode: ${record.employeeCode}`);
  //         if (emails.includes(record.email))
  //           fields.push(`Email: ${record.email}`);
  //         return fields.join(', ');
  //       });

  //       throw new Error(
  //         `The following records already exist in the system:\n${duplicateDetails.join(
  //           '\n',
  //         )}`,
  //       );
  //     }
  //     for (let index = 0; index < sheetData.length; index++) {
  //       const row = sheetData[index];

  //       try {
  //         const {
  //           Name,
  //           EmployeeCode,
  //           Gender,
  //           Phone,
  //           Email,
  //           Address,
  //           Landmark,
  //           Designation,
  //           SpecialConsideration,
  //           HomePoint,
  //         } = row;

  //         if (
  //           !Name ||
  //           !EmployeeCode ||
  //           !Gender ||
  //           !Phone ||
  //           !Email ||
  //           !Address ||
  //           !Landmark ||
  //           !SpecialConsideration ||
  //           !HomePoint
  //         ) {
  //           throw new Error(
  //             `Row ${
  //               index + 2
  //             } is missing required fields: Name, EmployeeCode, Gender, Phone, Email,
  //             Address, Landmark, SpecialConsideration and HomePoint are mandatory.`,
  //           );
  //         }
  //         const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  //         if (!emailRegex.test(Email)) {
  //           throw new Error(`Invalid email format at row ${index + 2}.`);
  //         }
  //         if (!/^[0-9]{10}$/.test(Phone)) {
  //           throw new Error(
  //             `Invalid phone number at row ${
  //               index + 2
  //             }. It should be 10 digits.`,
  //           );
  //         }
  //         const homePointRegex = /^([-+]?([1-8]?\d(\.\d{1,20})?|90(\.0{1,20})?)),\s*([-+]?((1[0-7]\d|[1-9]?\d)(\.\d{1,20})?|180(\.0{1,20})?))$/;
  //         if (!homePointRegex.test(HomePoint)) {
  //           throw new Error(`Invalid homePoint format(latitude, longitude) at row ${index + 2}.`);
  //         }
  //         validatedData.push({
  //           name: Name,
  //           employeeCode: EmployeeCode,
  //           phone: Phone,
  //           email: Email,
  //           address: Address,
  //           gender: Gender,
  //           landmark: Landmark,
  //           designation: Designation || null,
  //           specialConsideration: SpecialConsideration,
  //           homePoint: HomePoint,
  //           orgID: user?.orgID,
  //         });
  //       } catch (rowError) {
  //         throw new BadRequestException(rowError.message);
  //       }
  //     }

  //     return validatedData;
  //   } catch (err) {
  //     throw new BadRequestException(`Import failed: ${err.message}`);
  //   }
  // }
  private async validateEmployeeSheetData(
    sheetData: any[],
    user: any,
  ): Promise<any[]> {
    const errors: string[] = [];
    const validatedData: any[] = [];
    const employeeCodes = sheetData.map(
      (row) => row.EmployeeCode?.trim() || '',
    );
    const phoneNumbers = sheetData.map((row) => row.Phone?.trim() || '');
    const emails = sheetData.map((row) => row.Email?.trim() || '');

    const findDuplicates = (arr: string[]) =>
      arr.filter((item, index) => arr.indexOf(item) !== index);

    const duplicateEmployeeCodes = findDuplicates(employeeCodes);
    const duplicatePhones = findDuplicates(phoneNumbers);
    const duplicateEmails = findDuplicates(emails);

    if (duplicateEmployeeCodes.length > 0) {
      errors.push(
        `Duplicate employee codes: ${duplicateEmployeeCodes.join(', ')}`,
      );
    }
    if (duplicatePhones.length > 0) {
      errors.push(`Duplicate phone numbers: ${duplicatePhones.join(', ')}`);
    }
    if (duplicateEmails.length > 0) {
      errors.push(`Duplicate emails: ${duplicateEmails.join(', ')}`);
    }

    const existingRecords = await this.employeeModel.findAll({
      where: {
        orgID: user.orgID,
        updatedAt: null,
        [Op.or]: [
          { phone: { [Op.in]: phoneNumbers } },
          { employeeCode: { [Op.in]: employeeCodes } },
          { email: { [Op.in]: emails } },
        ],
      },
    });

    if (existingRecords.length > 0) {
      const duplicateDetails = existingRecords.map((record) => {
        const fields = [];
        if (phoneNumbers.includes(record.phone))
          fields.push(`Phone: ${record.phone}`);
        if (employeeCodes.includes(record.employeeCode))
          fields.push(`EmployeeCode: ${record.employeeCode}`);
        if (emails.includes(record.email))
          fields.push(`Email: ${record.email}`);
        return `Row with ${fields.join(', ')} already exists.`;
      });
      errors.push(...duplicateDetails);
    }
    for (let index = 0; index < sheetData.length; index++) {
      const row = sheetData[index];
      const rowErrors: string[] = [];

      // const {
      //   Name,
      //   EmployeeCode,
      //   Gender,
      //   Phone,
      //   Email,
      //   Address,
      //   Landmark,
      //   Designation,
      //   SpecialConsideration,
      //   HomePoint,
      // } = row;
      const Name = (row.Name || '').trim();
      const EmployeeCode = (row.EmployeeCode || '').trim();
      const Gender = (row.Gender || '').trim();
      const Phone = (row.Phone || '').toString().trim();
      const Email = (row.Email || '').trim();
      const Address = (row.Address || '').trim();
      const Landmark = (row.Landmark || '').trim();
      const Designation = (row.Designation || '').trim();
      const SpecialConsideration = (row.SpecialConsideration || '').trim();
      const HomePoint = (row.HomePoint || '').trim();

      if (!Name) rowErrors.push('Name is required');
      if (!EmployeeCode) rowErrors.push('EmployeeCode is required');
      if (!Gender) rowErrors.push('Gender is required');
      if (!Phone) rowErrors.push('Phone is required');
      if (!Email) rowErrors.push('Email is required');
      if (!Address) rowErrors.push('Address is required');
      if (!Landmark) rowErrors.push('Landmark is required');
      if (!SpecialConsideration)
        rowErrors.push('SpecialConsideration is required');
      if (!HomePoint) rowErrors.push('HomePoint is required');

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (Email && !emailRegex.test(Email.trim())) {
        rowErrors.push('Invalid email format');
      }

      if (Phone && !/^[0-9]{10}$/.test(Phone.trim())) {
        rowErrors.push('Phone must be 10 digits');
      }

      const homePointRegex =
        /^([-+]?([1-8]?\d(\.\d{1,20})?|90(\.0{1,20})?)),\s*([-+]?((1[0-7]\d|[1-9]?\d)(\.\d{1,20})?|180(\.0{1,20})?))$/;
      if (HomePoint && !homePointRegex.test(HomePoint.trim())) {
        rowErrors.push(
          "Invalid HomePoint format (must be 'latitude, longitude')",
        );
      }

      if (rowErrors.length > 0) {
        errors.push(`Row ${index + 2}: ${rowErrors.join(', ')}`);
      } else {
        validatedData.push({
          name: Name.trim(),
          employeeCode: EmployeeCode.trim(),
          phone: Phone.trim(),
          email: Email.trim(),
          address: Address.trim(),
          gender: Gender.trim(),
          landmark: Landmark.trim(),
          designation: Designation || null,
          specialConsideration: SpecialConsideration,
          homePoint: HomePoint.trim(),
          orgID: user?.orgID,
        });
      }
    }
    if (errors.length > 0) {
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }

    return validatedData;
  }

  async findAll(
    employeeFilterInput: EmployeeFilterInput,
    user: any,
  ): Promise<PaginatedList<Employee>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        employee,
      } = employeeFilterInput;

      let whereClause: any = {};
      if (employee) {
        whereClause.employeeType = EmployeeType.Employee;
      } else {
        whereClause.employeeType = EmployeeType.Transportation;
      }

      whereClause.orgID = user.orgID;
      if (search) {
        whereClause = {
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },

            {
              email: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              phone: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              employeeCode: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
        whereClause.orgID = user.orgID;
      }
      const employees = await this.employeeModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['id', [Sequelize.literal('"role"."name"'), 'Role']],
          },
          {
            model: Authentication,
            as: 'authInput',
            attributes: [
              [Sequelize.literal('"authInput"."status"'), 'AuthStatus'],
            ],
          },
          {
            model: Location,
            as: 'location',
            attributes: [
              'id',
              [Sequelize.literal('"location"."name"'), 'Location'],
            ],
          },
          {
            model: EmployeeDeviceInfo,
            as: 'employeeDeviceInfo',
            attributes: ['appVersion', 'deviceType', 'lastLogin'],
            required: false, // keep employees who have no device record
            where: {
              appVersion: { [Op.ne]: null },
              deviceType: { [Op.ne]: null },
              lastLogin: {
                [Op.eq]: Sequelize.literal(`(
                SELECT MAX("edi2"."lastLogin")
                FROM "EmployeeDeviceInfos" AS "edi2"
                WHERE "edi2"."employeeID" = "Employee"."id"
                  AND "edi2"."appVersion" IS NOT NULL
                  AND "edi2"."deviceType" IS NOT NULL
                  AND "edi2"."deletedAt" IS NULL
              )`),
              },
            },
          },
        ],
      });

      return {
        totalItems: employees.count,
        items: employees.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async listAllEmployees(
    employeeListFilterInput: EmployeeListFilterInput,
    user: any,
  ): Promise<PaginatedList<Employee>> {
    try {
      const {
        // take = 25,
        // skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        // search,
        employee,
      } = employeeListFilterInput;

      const whereClause: any = {};
      if (employee) {
        whereClause.employeeType = EmployeeType.Employee;
      } else {
        whereClause.employeeType = EmployeeType.Transportation;
      }

      whereClause.orgID = user.orgID;
      // if (search) {
      //   whereClause = {
      //     [Op.or]: [
      //       {
      //         name: {
      //           [Op.iLike]: `%${search}%`,
      //         },
      //       },

      //       {
      //         email: {
      //           [Op.iLike]: `%${search}%`,
      //         },
      //       },
      //       {
      //         phone: {
      //           [Op.iLike]: `%${search}%`,
      //         },
      //       },
      //       {
      //         employeeCode: {
      //           [Op.iLike]: `%${search}%`,
      //         },
      //       },
      //     ],
      //   };
      //   whereClause.orgID = user.orgID;
      // }
      const employees = await this.employeeModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        // limit: take,
        // offset: skip * take,
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['id', [Sequelize.literal('"role"."name"'), 'Role']],
          },
          {
            model: Authentication,
            as: 'authInput',
            attributes: [
              [Sequelize.literal('"authInput"."status"'), 'AuthStatus'],
            ],
          },
          {
            model: Location,
            as: 'location',
            attributes: [
              'id',
              [Sequelize.literal('"location"."name"'), 'Location'],
            ],
          },
          {
            model: EmployeeDeviceInfo,
            as: 'employeeDeviceInfo',
            attributes: ['appVersion', 'deviceType', 'lastLogin'],
            required: false, // keep employees who have no device record
            where: {
              appVersion: { [Op.ne]: null },
              deviceType: { [Op.ne]: null },
              lastLogin: {
                [Op.eq]: Sequelize.literal(`(
              SELECT MAX("edi2"."lastLogin")
              FROM "EmployeeDeviceInfos" AS "edi2"
              WHERE "edi2"."employeeID" = "Employee"."id"
                AND "edi2"."appVersion" IS NOT NULL
                AND "edi2"."deviceType" IS NOT NULL
                AND "edi2"."deletedAt" IS NULL
            )`),
              },
            },
          },
        ],
      });

      return {
        totalItems: employees.count,
        items: employees.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async allEmployees(
    employeeListFilterInput: EmployeeListFilterInput,
    user: any,
  ): Promise<PaginatedList<Employee>> {
    try {
      const { sortBy = 'id', sortOrder = SortOrder.DESC } =
        employeeListFilterInput;
      const whereClause: any = {};
      whereClause.orgID = user.orgID;

      const employees = await this.employeeModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['id', [Sequelize.literal('"role"."name"'), 'Role']],
          },
          {
            model: Authentication,
            as: 'authInput',
            attributes: [
              [Sequelize.literal('"authInput"."status"'), 'AuthStatus'],
            ],
          },
          {
            model: Location,
            as: 'location',
            attributes: [
              'id',
              [Sequelize.literal('"location"."name"'), 'Location'],
            ],
          },
        ],
      });

      return {
        totalItems: employees.count,
        items: employees.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
  async findAllemployeesByOrgID(
    employeeFilterInput: EmployeeFilterInput,
    user: any,
  ): Promise<PaginatedList<Employee>> {
    try {
      const {
        take,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        orgID,
      } = employeeFilterInput;
      let whereClause: any = {};

      if (search) {
        whereClause = {
          [Op.and]: [
            whereClause,
            {
              [Op.or]: [
                { employeeCode: { [Op.iLike]: `%${search}%` } },
                { name: { [Op.iLike]: `%${search}%` } },
              ],
            },
          ],
        };
      }

      if (user?.userType === 'SuperAdmin') {
        whereClause.orgID = orgID;
        whereClause.employeeType = UserType.Admin;
      } else if (user?.userType === 'Employee') {
        whereClause.orgID = user?.orgID;
        whereClause.employeeType = UserType.Employee;
      } else {
        whereClause.orgID = user?.orgID;
        whereClause.employeeType = UserType.Admin;
      }

      const employees = await this.employeeModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,

        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
      });
      return {
        totalItems: employees.count,
        items: employees.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findEmployeesByOrgIDTripView(
    employeeFilterInput: EmployeeFilterInput,
    user: any,
    date: string,
    shiftTime: string,
    pickDrop: string,
    search: string,
    excludeIds: string[],
  ): Promise<PaginatedList<any>> {
    try {
      const {
        take,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        orgID,
      } = employeeFilterInput;
      let whereClause: any = {};

      if (search) {
        whereClause = {
          [Op.and]: [
            whereClause,
            {
              [Op.or]: [
                { employeeCode: { [Op.iLike]: `%${search}%` } },
                { name: { [Op.iLike]: `%${search}%` } },
              ],
            },
          ],
        };
      }

      if (user?.userType === 'SuperAdmin') {
        whereClause.orgID = orgID;
        whereClause.employeeType = UserType.Admin;
      } else if (user?.userType === 'Employee') {
        whereClause.orgID = user?.orgID;
        whereClause.employeeType = UserType.Employee;
      } else {
        whereClause.orgID = user?.orgID;
        whereClause.employeeType = UserType.Admin;
      }

      // ✅ Exclude already-selected employees if needed
      if (excludeIds?.length) {
        whereClause.id = { [Op.notIn]: excludeIds };
      }
      whereClause.status = Status.Active;
      const employees = await this.employeeModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,

        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
      });

      const trips = await this.tripModel.findAndCountAll({
        where: {
          shiftTime,
          date,
          pickDrop: pickDrop,
        },
      });

      const employeesInTrips = new Set<string>();

      trips.rows.forEach((trip) => {
        trip.employees.forEach((emp: any) => {
          employeesInTrips.add(emp.id);
        });
      });

      // 2. Filter employees who are NOT in trips
      const availableEmployees = employees.rows?.filter(
        (emp: any) => !employeesInTrips.has(emp.id),
      );

      // 5. Map to frontend-friendly format
      const items = availableEmployees.map((e) => ({
        label: `${e.name} (${e.employeeCode})${
          e.specialConsideration === 'Yes' ? '*' : ''
        }`,
        value: e.id,
        lockStatus: null,
        routeNumber: null,
        disabled: false,
      }));

      return {
        items,
        totalItems: availableEmployees.length,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getEmployeeTeamShiftDetails(id: any, currentUser: any) {
    const employee = await this.employeeModel.findOne({
      where: { id, orgID: currentUser.orgID },
    });
    if (!employee) {
      throw new BadRequestException('Employee not found.');
    }
    if (!employee.teamID) {
      return { message: 'Employee is not assigned to any team.' };
    }
    const teamDetails = await this.teamModel.findOne({
      where: { id: employee.teamID, status: 'Active' },
    });
    if (!teamDetails) {
      return {
        message: 'Team not found.',
      };
    }
    if (!teamDetails.isShiftEnabled) {
      return {
        message: 'Shift is not enabled for this team.',
      };
    }
    const process = await this.processModel.findOne({
      where: { id: teamDetails.processID, status: 'Active' },
    });

    if (!process) {
      return {
        message: 'Team cannot be considered because its process is inactive.',
      };
    }
    return {
      message: 'Shift times fetched successfully.',
      team: {
        id: teamDetails.id,
        name: teamDetails.name,
      },
      loginTime: teamDetails.shiftLoginTime,
      logoutTime: teamDetails.shiftLogoutTime,
    };
  }

  async findAllManagers(
    employeeFilterInput: EmployeeFilterInput,
    user: any,
  ): Promise<PaginatedList<Employee>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        search,
        sortOrder = SortOrder.DESC,
      } = employeeFilterInput;
      let whereClause: any = {};

      whereClause.id = { [Op.ne]: user.id };
      if (search) {
        whereClause = {
          [Op.or]: [
            {
              name: {
                [Op.iLike]: `%${search}%`,
              },
            },

            {
              email: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }
      const employees = await this.employeeModel.findAndCountAll({
        order: [[`${sortBy}`, `${sortOrder}`]],
        where: whereClause,
        limit: take,
        offset: skip * take,
      });
      return {
        totalItems: employees.count,
        items: employees.rows,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findOne(id: bigint, user?: any): Promise<GenericResponse<Employee>> {
    try {
      const whereClause: any = {};
      if (user) {
        whereClause.orgID = user.orgID;
      }
      whereClause.id = id;
      const employee = await this.employeeModel.findOne({
        where: whereClause,
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['id', 'name'],
          },
          {
            model: Organization,
            as: 'organization',
            attributes: ['id', 'name'],
          },
          {
            model: Employee,
            as: 'report',
            attributes: ['id', 'name'],
          },
          {
            model: Team,
            as: 'team',
            attributes: [
              'id',
              'name',
              'isShiftEnabled',
              'shiftLoginTime',
              'shiftLogoutTime',
              'isTeamConfigEnabled',
              'teamConfig',
              'isAutoLogoutEnabled',
              'workHours',
            ],
            required: false,
          },
          {
            model: Location,
            as: 'location',
            attributes: ['id', 'name'],
          },
          {
            model: CommonPoint,
            as: 'commonPoint',
            attributes: ['id', 'name'],
          },
          {
            model: Process,
            as: 'process',
            attributes: ['id', 'name'],
          },
          {
            model: Costcenter,
            as: 'costcenter',
            attributes: ['id', 'name'],
          },
          {
            model: Profile,
            as: 'profileInput',
            required: false,
          },
          {
            model: Authentication,
            as: 'authInput',
            required: false,
          },
          {
            model: ApprovalRequest,
            as: 'approvalRequest',
            required: false,
            where: { status: 'Pending', employeeID: whereClause.id },
          },
        ],
      });
      if (employee) {
        return {
          message: 'Employee found',
          data: employee,
        };
      } else {
        throw new NotFoundException(
          'Employee not found or this employee is not in this organization',
        );
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateEmployeeInput: UpdateEmployeeInput,
    user: any,
  ): Promise<any> {
    try {
      const employee = await this.employeeModel.findOne({
        where: { id: id },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }
      const validationErrors = await uniqueFieldsCheck(
        this.employeeModel,
        ['email', 'phone', 'employeeCode'],
        updateEmployeeInput,
        id,
        user?.orgID,
      );
      handleErrors(validationErrors, 'unique');
      const org = await this.orgService.findOne(user?.orgID);
      const orgGeoCode = org?.data?.geoCode;
      let commutedDistance = {
        distance: null,
        time: null,
      };
      if (updateEmployeeInput.homePoint && orgGeoCode) {
        commutedDistance = await this.googleMapsService.getDistance(
          orgGeoCode,
          updateEmployeeInput.homePoint,
        );
      }
      const updatedEmployee = await this.employeeModel.update(
        {
          ...updateEmployeeInput,
          commuteDistance: commutedDistance.distance,
          commuteTime: commutedDistance.time,
        },
        {
          where: { id },
          returning: true,
        },
      );
      if (updateEmployeeInput.status === Status.Active) {
        if (employee) {
          await this.authModel.update(
            {
              failedLoginAttempts: 0,
              status: Status.Active,
            },
            {
              where: {
                employeeID: employee.id,
                userType: UserType.Employee,
              },
            },
          );
        }
      }
      // Diff computed once, up front, and reused both for the Transport
      // Team email alert (below) and the event log's changeJSON — was
      // previously only computed inside the Transport-only branch, so
      // every other employee type's edit had nothing to diff against.
      // Diffed against existingCombined (Employee fields + Profile's
      // dob/bloodGroup/emergencyContact*) rather than the bare Employee
      // row, since those four fields actually live on Profile, not
      // Employee — diffing against `employee` alone made every
      // profile-field edit look like a change from undefined even when
      // nothing actually changed.
      const existingProfile = await this.profileModel.findOne({
        where: { employeeID: id },
      });
      // authStatus isn't a column on Employee — it lives on
      // Authentication.status. Without it here, existingCombined has no
      // authStatus key at all, so buildChangeDiff() always compares
      // undefined against whatever updateEmployeeInput.authStatus
      // contains and reports it as changed even when nothing actually
      // changed.
      const existingAuth = await this.authModel.findOne({
        where: { employeeID: id, userType: UserType.Employee },
        attributes: ['status'],
      });
      const existingCombined = {
        ...employee.get({ plain: true }),
        dob: existingProfile?.dob ?? null,
        bloodGroup: existingProfile?.bloodGroup ?? null,
        emergencyContactNo: existingProfile?.emergencyContactNo ?? null,
        emergencyContactName: existingProfile?.emergencyContactName ?? null,
        authStatus: existingAuth?.status ?? null,
      };
      const { oldRecord, newRecord } = buildChangeDiff(
        existingCombined,
        updateEmployeeInput,
      );

      // Resolve roleID -> role name, if role changed. Was previously
      // only run inside the Transport-only branch below, so a
      // non-Transport employee's role change showed a raw numeric
      // roleID in the log instead of the role name.
      if (Object.prototype.hasOwnProperty.call(newRecord, 'roleID')) {
        const roleIDs = [oldRecord.roleID, newRecord.roleID].filter(Boolean);
        if (roleIDs.length > 0) {
          const roles = await this.roleModel.findAll({
            where: { id: { [Op.in]: roleIDs } },
            attributes: ['id', 'name'], // confirm actual field name on Role
          });
          const roleNameMap = new Map(
            roles.map((r: any) => [String(r.id), r.name]),
          );
          oldRecord.roleID =
            roleNameMap.get(String(oldRecord.roleID)) ?? oldRecord.roleID;
          newRecord.roleID =
            roleNameMap.get(String(newRecord.roleID)) ?? newRecord.roleID;
        }
      }

      // Resolves teamID/processID/commonPointID/reportingID/locationID/
      // costcenterID to display names in place — was previously only
      // run inside the Transport-only branch below, so a non-Transport
      // employee's changeJSON showed raw foreign-key IDs instead of
      // names. Hoisted so every employee type's log gets the same
      // readable labels the Transport email alert already got.
      await this.resolveForeignKeyNamesInDiff(oldRecord, newRecord);

      // --- Transport Team profile-edit alert (any field change) ---
      if ((employee.employeeType as string) === UserType.Transport) {
        if (Object.keys(newRecord).length > 0) {
          this.sendEmployeeProfileChangeEmail({
            employeeName: employee.name,
            employeeCode: employee.employeeCode,
            oldRecord,
            newRecord,
            orgID: user?.orgID,
            updatedByUsername: user?.email || user?.name,
          });
        }
      }
      // Was payload: updatedEmployee — the raw return value of
      // employeeModel.update(), a [affectedCount, rows[]] tuple, not a
      // plain object. DetailTable's payloadJSON branch did
      // Object.entries() on that tuple (keys "0"/"1", neither with a
      // .label), so every row rendered blank. Curated identifier +
      // a real per-field changeJSON diff instead — reuses whatever
      // buildChangeDiff() already computed above (including the
      // roleID and other foreign-key name resolution, now applied for
      // every employee type).
      const changeJSON: Record<string, { OldValue: any; newValue: any }> = {};
      for (const key of Object.keys(newRecord)) {
        if (key === 'sortOrder') continue;
        changeJSON[key] = {
          OldValue: oldRecord[key],
          newValue: newRecord[key],
        };
      }
      const fieldCount = Object.keys(changeJSON).length;
      const employeeName = updateEmployeeInput?.name ?? employee.name;
      const employeeIdentifier = `${employeeName} (${employee.employeeCode})`;
      // Separate "Name - Code" format for the update branches below, per
      // request — distinct from employeeIdentifier's "Name (Code)" shape
      // used by the attrition branch, which stays as-is.
      const employeeNameCode = `${employeeName} - ${employee.employeeCode}`;
      // Attrition takes priority over the normal field-count description
      // — an exit date being set is a distinct enough event that it
      // should be immediately visible in the log list without needing
      // to expand the row.
      const attritionMarked = Boolean(updateEmployeeInput?.exitDate);
      const isTransportTeam =
        (employee.employeeType as string) === UserType.Transport;
      const employeeLabel = isTransportTeam
        ? 'Transport Team Employee'
        : 'Employee';
      const eventLog = {
        objectType: 'Employee',
        changeType: 'edit',
        objectID: id,
        authID: user.id,
        orgID: user?.orgID,
        updatedBy: user.name,
        payload: {
          employeeID: id,
          employeeCode: employee.employeeCode,
          name: updateEmployeeInput?.name ?? employee.name,
        },
        requestPayload: JSON.parse(JSON.stringify(updateEmployeeInput)),
        changeJSON,
        customDescription: attritionMarked
          ? `marked attrition for ${employeeIdentifier}`
          : fieldCount > 1
          ? `updated ${fieldCount} fields in ${employeeLabel} (${employeeNameCode})`
          : `updated ${employeeLabel} (${employeeNameCode})`,
        user,
      };
      await this.eventlogService.create(eventLog);
      if (updateEmployeeInput?.authStatus) {
        await this.authModel.update(
          {
            status: updateEmployeeInput?.authStatus,
            reActivationTime: new Date(),
            failedLoginAttempts: 0,
          },
          {
            where: { employeeID: id.toString() },
            returning: true,
          },
        );
      }
      if (updatedEmployee) {
        const profileInput = {
          dob: updateEmployeeInput.dob,
          address: updateEmployeeInput.address,
          bloodGroup: updateEmployeeInput.bloodGroup,
          emergencyContactNo: updateEmployeeInput.emergencyContactNo,
          emergencyContactName: updateEmployeeInput.emergencyContactName,
          employeeID: id,
        };
        await this.profileService.update(profileInput);
        const authInput = {
          name: updateEmployeeInput.name,
          phone: updateEmployeeInput.phone,
          email: updateEmployeeInput.email,
        };
        await this.authModel.update(authInput, { where: { employeeID: id } });
        const phoneChanged =
          updateEmployeeInput.phone &&
          updateEmployeeInput.phone !== employee.phone;
        const emailChanged =
          updateEmployeeInput.email &&
          updateEmployeeInput.email !== employee.email;
        if (phoneChanged || emailChanged) {
          const authUser = await this.authModel.findOne({
            where: { employeeID: id },
            attributes: ['id'],
          });
          if (authUser) {
            await this.sessionService.invalidate(authUser.id.toString());
          }
        }
        return {
          message: 'Employee updated successfully',
          data: updatedEmployee,
        };
      } else {
        throw new NotFoundException('Employee not found');
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  private async resolveForeignKeyNamesInDiff(
    oldRecord: Record<string, any>,
    newRecord: Record<string, any>,
  ): Promise<void> {
    interface FkConfig {
      key: string;
      label: string;
      model: any; // widen to `any` to avoid TS narrowing each entry to its own model type
      nameField: string;
    }
    const fkConfigs: FkConfig[] = [
      {
        key: 'roleID',
        label: 'role',
        model: this.roleModel,
        nameField: 'name',
      },
      {
        key: 'teamID',
        label: 'team',
        model: this.teamModel,
        nameField: 'name',
      },
      {
        key: 'processID',
        label: 'process',
        model: this.processModel,
        nameField: 'name',
      },
      {
        key: 'commonPointID',
        label: 'commonPoint',
        model: this.commonPointModel,
        nameField: 'name',
      },
      {
        key: 'reportingID',
        label: 'reportingManager',
        model: this.employeeModel,
        nameField: 'name',
      },
      {
        key: 'locationID',
        label: 'zone',
        model: this.locationModel,
        nameField: 'name',
      }, // confirm field name
      {
        key: 'locationID',
        label: 'zone',
        model: this.locationModel,
        nameField: 'name',
      },
      {
        key: 'costcenterID',
        label: 'costCenter',
        model: this.costcenterModel,
        nameField: 'name', // confirm actual field name on Costcenter
      },
    ];

    for (const cons of fkConfigs) {
      if (!Object.prototype.hasOwnProperty.call(newRecord, cons.key)) {
        continue;
      }

      const oldValue = oldRecord[cons.key];
      const newValue = newRecord[cons.key];
      const idsToResolve = [oldValue, newValue].filter(Boolean);

      let nameMap = new Map<string, string>();

      if (idsToResolve.length > 0) {
        const records = await cons.model.findAll({
          where: { id: { [Op.in]: idsToResolve } },
          attributes: ['id', cons.nameField],
        });
        nameMap = new Map(
          records.map((r: any) => [String(r.id), r[cons.nameField]]),
        );
      }

      delete oldRecord[cons.key];
      delete newRecord[cons.key];

      oldRecord[cons.label] = oldValue
        ? nameMap.get(String(oldValue)) ?? oldValue
        : 'N/A';
      newRecord[cons.label] = newValue
        ? nameMap.get(String(newValue)) ?? newValue
        : 'N/A';
    }
  }

  private async sendEmployeeProfileChangeEmail(params: {
    employeeName: string;
    employeeCode: string;
    oldRecord: Record<string, any>;
    newRecord: Record<string, any>;
    orgID?: string;
    updatedByUsername?: string;
    changeType?: 'created' | 'updated'; // NEW
  }): Promise<void> {
    const {
      employeeName,
      employeeCode,
      oldRecord,
      newRecord,
      orgID,
      updatedByUsername,
      changeType = 'updated',
    } = params;

    try {
      const emailRecipientsConfig =
        await this.configurationService.getConfigValue(
          'ADMIN_EMAIL_ALERT_RECIPIENTS',
          BigInt(orgID),
        );

      if (!emailRecipientsConfig) {
        this.logger.warn(
          `[TRANSPORT PROFILE EMAIL] No recipients configured for org ${orgID}. Skipping.`,
        );
        return;
      }

      const emailRecipients = emailRecipientsConfig
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      if (emailRecipients.length === 0) return;

      const subjectAction = changeType === 'created' ? 'Created' : 'Updated';
      await this.emailService.sendEmail({
        mailTo: emailRecipients,
        subject: `Transport Team Profile ${subjectAction} - ${employeeName}`,
        templateName: 'employee-profile-change-alert',
        mailBody: {
          employeeName,
          employeeCode,
          oldRecord,
          newRecord,
          updatedByUsername: updatedByUsername ?? 'N/A',
          actionLabel: subjectAction,
          updatedAt: new Date().toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
        isAttachments: false,
        attachments: [],
      });

      this.logger.log(
        `[TRANSPORT PROFILE EMAIL] Profile ${changeType} email sent successfully for org ${orgID}`,
      );
    } catch (error) {
      this.logger.error(
        `[TRANSPORT PROFILE EMAIL] Failed to send profile ${changeType} email for org ${orgID}:`,
        error,
      );
    }
  }

  private formatDatesInDiff(record: Record<string, any>): void {
    const dateFields = ['dob', 'exitDate', 'joinedDate'];

    for (const field of dateFields) {
      if (record[field]) {
        const dateValue =
          typeof record[field] === 'string'
            ? record[field].replace(/^"|"$/g, '') //here dates are received in double quotes .Removing it.
            : record[field];

        record[field] = moment(dateValue).format('DD-MM-YYYY');
      }
    }
  }

  async softDelete(id: bigint, user: any): Promise<GenericResponse<null>> {
    try {
      const eventLog = {
        objectType: 'Employee',
        changeType: 'delete',
        objectID: id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: '',
        requestPayload: id,
        user,
      };
      this.eventlogService.create(eventLog);
      await this.employeeModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'Employee  deleted successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async findEmployeeWithLocation(id: string): Promise<Employee> {
    const employee = await this.employeeModel.findOne({
      where: {
        locationID: id,
      },
    });
    return employee;
  }

  async deleteLocationIdOfEmployees(id: string): Promise<any> {
    const employee = await this.employeeModel.update(
      { locationID: null },
      {
        where: {
          locationID: id,
        },
      },
    );
    return employee;
  }

  async calculateEmployeeComiuteDistance(user: any): Promise<boolean> {
    const employees = await this.employeeModel.findAll({
      where: {
        orgID: user.orgID,
        commuteDistance: null,
        homePoint: {
          [Op.ne]: null,
        },
      },
    });

    const org = await this.orgService.findOne(user.orgID);
    const orgGeoCode = org?.data?.geoCode;

    if (!orgGeoCode || !employees.length) return false;

    for (const employee of employees) {
      const commutedDistance = await this.googleMapsService.getDistance(
        orgGeoCode,
        employee.homePoint,
      );

      if (commutedDistance?.distance && commutedDistance?.time) {
        await this.employeeModel.update(
          {
            commuteDistance: commutedDistance.distance,
            commuteTime: commutedDistance.time,
          },
          {
            where: { id: employee.id },
          },
        );
      }
    }

    return true;
  }

  async findEmployeeWithNoLocation(user: any): Promise<Employee[]> {
    const employee = await this.employeeModel.findAll({
      where: {
        locationID: null,
        orgID: user.orgID,
        employeeType: EmployeeType.Employee,
        status: Status.Active,
      },
      attributes: [
        'id',
        'name',
        'employeeCode',
        'designation',
        'address',
        'locationID',
        'commuteDistance',
        'sortOrder',
        'status',
      ],
    });
    return employee;
  }

  async findEmployeeWithCommonPoint(id: string): Promise<Employee> {
    const employee = await this.employeeModel.findOne({
      where: {
        commonPointID: id,
      },
    });
    return employee;
  }

  // async eployeeSequalizedWithInZone(
  //   employeeData: Record<string, { id: string }[]>,
  // ): Promise<any> {
  //   const updatePromises = [];

  //   for (const [locationID, employees] of Object.entries(employeeData)) {
  //     employees.forEach((employee, index) => {
  //       updatePromises.push(
  //         this.employeeModel.update(
  //           {
  //             locationID: Number(locationID), // Ensure correct type
  //             sortOrder: index + 1, // Assign sortOrder based on array position
  //           },
  //           {
  //             where: { id: employee.id }, // Find employee by ID
  //           },
  //         ),
  //       );
  //     });
  //   }

  //   // Execute all updates in parallel
  //   await Promise.all(updatePromises);
  //   return { message: 'Employees updated successfully' };
  // }

  async eployeeSequalizedWithInZone(
    employeeData: Record<string, any>,
  ): Promise<any> {
    const updatePromises = [];

    // Extract locked zone IDs, remove from employee map
    const lockedZoneIds: string[] = employeeData['__lockedZones'] || [];
    const zoneEntries = Object.entries(employeeData).filter(
      ([key]) => key !== '__lockedZones',
    );

    // Update employee sortOrder and locationID
    for (const [locationID, employees] of zoneEntries) {
      (employees as { id: string }[]).forEach((employee, index) => {
        updatePromises.push(
          this.employeeModel.update(
            {
              locationID: Number(locationID),
              sortOrder: index + 1,
            },
            { where: { id: employee.id } },
          ),
        );
      });
    }

    //  Persist lock state for ALL zones:
    // locked zones → isLocked: true, all others → isLocked: false
    const allZoneIds = zoneEntries.map(([id]) => id);

    for (const zoneId of allZoneIds) {
      updatePromises.push(
        Location.update(
          { isLocked: lockedZoneIds.includes(zoneId) },
          { where: { id: Number(zoneId) } },
        ),
      );
    }

    await Promise.all(updatePromises);
    return { message: 'Employees updated successfully' };
  }

  async findGuestEmployee(
    orgID: bigint,
    phone: string,
    email: string,
  ): Promise<Employee> {
    const employee = await this.employeeModel.findOne({
      where: {
        orgID,
        phone,
        email,
        employeeType: EmployeeType.Guest,
      },
    });
    return employee;
  }

  async createGuestEmployee(
    employeeId: bigint,
    selectedOrgID: bigint,
  ): Promise<Employee> {
    const employee = await this.findOne(employeeId);
    const {
      name,
      employeeCode,
      email,
      phone,
      designation,
      gender,
      specialConsideration,
    } = employee.data;
    const guest = await this.employeeModel.create({
      name,
      employeeCode,
      email,
      phone,
      designation,
      gender,
      specialConsideration,
      orgID: selectedOrgID,
      authID: null,
      homePoint: null,
      employeeType: EmployeeType.Guest,
    });
    return guest;
  }

  async employeeChangeHomePoint(user: any, homePoint: string): Promise<any> {
    const employeeApprovalEnabled =
      (await this.configurationService.getConfigValue(
        'Approval Request',
        user.orgID,
      )) === 'Yes';

    if (employeeApprovalEnabled) {
      const employee = await this.employeeModel.findOne({
        where: { id: user.employeeID },
        attributes: ['homePoint', 'name'],
      });

      const oldRecord = { homePoint: employee?.homePoint };
      const newRecord = { homePoint };

      await this.approvalRequestModel.create({
        requestedBy: 'Employee',
        employeeID: user.employeeID,
        orgID: user.orgID,
        oldRecord,
        newRecord,
        status: 'Pending',
      });

      const eventLog = {
        objectType: 'Employee',
        changeType: 'edit',
        objectID: user.employeeID,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: {
          previousGeoCode: oldRecord.homePoint,
          currentGeoCode: newRecord.homePoint,
          approvalRequired: employeeApprovalEnabled,
        },
        requestPayload: { homePoint },
        changeJSON: {
          homePoint: {
            OldValue: oldRecord.homePoint,
            newValue: newRecord.homePoint,
          },
          approvalRequired: {
            OldValue: employeeApprovalEnabled,
            newValue: employeeApprovalEnabled,
          },
        },
        customDescription: 'updated Home Point. Send for approval',
        user,
      };
      await this.eventlogService.create(eventLog);

      const org = await this.orgService.findOne(user.orgID);

      if (org?.data?.email) {
        const alertEmailsRaw = await this.configurationService.getConfigValue(
          'HomePoint Change Email Alert',
          user.orgID,
        );
        const extraEmails = alertEmailsRaw
          ? alertEmailsRaw
              .split(',')
              .map((e) => e.trim())
              .filter(Boolean)
          : [];
        const mailTo = [...new Set([org.data.email, ...extraEmails])];

        await this.emailService.sendEmail({
          mailTo,
          subject: 'Employee Home Geocode Change Request',
          templateName: 'approval-request',
          mailBody: {
            employeeName: employee?.name,
            oldRecord,
            newRecord,
            deepLink: `${this.config.get(
              'ADMIN_VERIFY_URL',
            )}/approval-request?tab=pending`,
          },
          isAttachments: false,
          attachments: [],
        });
      }

      return {
        message: 'Profile update request sent for approval.',
      };
    }

    // No approval required — fetch the current geocode first so the event
    // log can capture a real previous value, then apply the update.
    const existingEmployee = await this.employeeModel.findOne({
      where: { id: user.employeeID },
      attributes: ['homePoint'],
    });
    const previousGeoCode = existingEmployee?.homePoint ?? null;

    const employee = await this.employeeModel.update(
      { homePoint },
      {
        where: { id: user.employeeID },
        returning: true,
      },
    );

    const eventLog = {
      objectType: 'Employee',
      changeType: 'edit',
      objectID: user.employeeID,
      authID: user.id,
      orgID: user.orgID,
      updatedBy: user.name,
      payload: {
        previousGeoCode,
        currentGeoCode: homePoint,
        approvalRequired: employeeApprovalEnabled,
      },
      requestPayload: { homePoint },
      changeJSON: {
        homePoint: {
          OldValue: previousGeoCode,
          newValue: homePoint,
        },
      },
      customDescription: 'updated Home Point',
      user,
    };
    this.eventlogService.create(eventLog);

    return {
      message: 'Employee home point updated successfully',
      data: employee,
    };
  }

  async setSecurityPin(
    user: any,
    securityPinDto: SetSecurityPinDto,
  ): Promise<GenericResponse<Profile>> {
    const profile = await this.profileModel.findOne({
      where: {
        employeeID: user.employeeID,
      },
      attributes: ['id', 'dob', 'bloodGroup', 'address', 'image', 'employeeID'],
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    const hashedPin = await this.administratorService.generateHashedPassword(
      securityPinDto.securityPin,
    );
    await profile.update({
      // securityPin: securityPinDto.securityPin,
      securityPin: hashedPin,
    });

    return {
      status: true,
      message: 'Security PIN updated successfully.',
      // data: profile,
    };
  }

  async findEmployeesWithEmployeeCode(
    codes: any[],
    orgID: any,
  ): Promise<Employee[]> {
    const employee = await this.employeeModel.findAll({
      where: {
        employeeCode: {
          [Op.in]: codes,
        },
        orgID: orgID,
        status: Status.Active,
      },
      attributes: ['id', 'employeeCode', 'locationID'],
      include: [
        { model: Location, as: 'location', attributes: ['id', 'name'] },
      ],
    });
    return employee;
  }

  async updateStatusAttrition(): Promise<any> {
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Update all employees whose exitDate is today
    const [count, updatedEmployees] = await this.employeeModel.update(
      { exit: true, status: Status.Inactive },
      {
        where: {
          exitDate: {
            [Op.lte]: formattedDate, // exitDate <= today
          },
        },
        returning: true,
      },
    );

    // If employees were updated, update corresponding authModel rows
    if (count > 0 && updatedEmployees.length > 0) {
      const employeeIds = updatedEmployees.map((emp) => emp.id); // or emp.dataValues.id

      const [auth, updatedAuth] = await this.authModel.update(
        { status: Status.Inactive },
        {
          where: {
            employeeID: employeeIds,
          },
          returning: true,
        },
      );
      // logout all affected users
      if (auth > 0 && updatedAuth.length > 0) {
        for (const auth of updatedAuth) {
          await this.authService.logout(auth.id);
        }
      }
      // 3. Handle future trip requests for these employees
      const futureTripRequests = await this.tripRequestModel.findAll({
        where: {
          employeeID: employeeIds,
          date: { [Op.gt]: formattedDate }, // only trips after today
        },
        attributes: ['id'],
      });
      let tripRequestIds: any[] = [];
      if (futureTripRequests.length > 0) {
        tripRequestIds = futureTripRequests.map((req) => req.id);

        // Assuming you want to reject them
        //   await this.tripRequestService.updateStatus(
        //     tripRequestIds,
        //     "Rejected", // or whatever enum/status you use
        //   );

        const requests = await this.tripRequestModel.findAll({
          where: { id: { [Op.in]: tripRequestIds } },
        });

        // if (updateStatus === Status.Rejected) {
        for (const req of requests) {
          if (req.tripID) {
            const trip = await this.tripModel.findOne({
              where: { id: req.tripID },
            });

            if (!trip) continue;

            if (trip.lockStatus === Status.Active) {
              throw new BadRequestException(
                `Trip request belongs to a locked trip, cannot be rejected.`,
              );
            }

            // Remove this employee from trip.employees JSONB
            const updatedEmployees = (trip.employees || []).filter(
              (emp) => emp.tripRequestID !== Number(req.id),
            );

            // Count how many requests are still linked to this trip
            const tripRequestsCount = await this.tripRequestModel.count({
              where: {
                tripID: trip.id,
                status: { [Op.ne]: Status.Rejected },
              },
            });

            if (tripRequestsCount <= 1) {
              // This was the only request in the trip → cancel trip
              await trip.update({
                status: TripStatus.Cancelled,
                employees: [],
              });
            } else {
              // Update employees list
              await trip.update({ employees: updatedEmployees });
            }
            await req.update({ tripID: null, status: Status.Rejected });
          } else {
            await req.update({ status: Status.Rejected });
          }
        }

        return { message: 'Trip requests rejected successfully' };
      }
      const updatedTrips = await this.tripRequestModel.update(
        { status: Status.Rejected },
        {
          where: { id: { [Op.in]: tripRequestIds } },
          returning: true,
        },
      );

      return {
        message: 'Trip requests updated successfully',
        data: updatedTrips?.[1] ?? [],
      };
    }
  }

  async importEmployeesZone(file: Buffer, user: any): Promise<object> {
    try {
      // ── 1. Parse workbook ──────────────────────────────────────
      const workbook = XLSX.read(file, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];

      const sheetData: any[][] = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        { header: 1, raw: false },
      );

      if (!sheetData?.length) {
        throw new BadRequestException('The Excel file is empty.');
      }

      // ── 2. Header validation ───────────────────────────────────
      const headers = (sheetData[0] as string[]).map((h) => h?.trim());
      const requiredHeaders = [
        'Location Name',
        'Location Id',
        // 'GeoCode',
        'Employee Code',
        'Employee Name',
      ];
      const missingHeaders = requiredHeaders.filter(
        (h) => !headers.includes(h),
      );
      if (missingHeaders.length > 0) {
        throw new BadRequestException(
          `The Excel file is missing required headers: ${missingHeaders.join(
            ', ',
          )}.`,
        );
      }

      // ── 3. Convert to objects ──────────────────────────────────
      const sheetDataObjects: any[] = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        { raw: false },
      );

      if (!sheetDataObjects?.length) {
        throw new BadRequestException(
          'The Excel file contains no valid data rows.',
        );
      }

      // ── 4.  Check for locked zones BEFORE validation ─────────
      const locationIdsInFile = [
        ...new Set(
          sheetDataObjects
            .map((r) => Number((r['Location Id'] || '').toString().trim()))
            .filter((n) => !isNaN(n) && n > 0),
        ),
      ];

      if (locationIdsInFile.length > 0) {
        const lockedZones = await this.locationModel.findAll({
          where: {
            id: { [Op.in]: locationIdsInFile },
            orgID: user.orgID,
            isLocked: true,
          },
          attributes: ['id', 'name'],
        });

        if (lockedZones.length > 0) {
          const lockedNames = lockedZones
            .map((z) => `${z.name} (ID: ${z.id})`)
            .join(', ');
          throw new BadRequestException(
            `Import blocked. The following zones are locked: ${lockedNames}. Unlock them before importing.`,
          );
        }
      }

      // ── 5. Validate sheet data ─────────────────────────────────
      let validatedRows: IZoneRow[];
      try {
        validatedRows = await this.validateEmployeeZoneSheetData(
          sheetDataObjects,
          user,
        );
      } catch (error) {
        throw new BadRequestException(
          `Data validation failed: ${error.message}`,
        );
      }

      // ── 6. Persist inside a transaction ───────────────────────
      const transaction = await this.sequelize.transaction();
      try {
        let updatedEmployeeCount = 0;

        // Update each employee's locationID only
        for (const row of validatedRows) {
          const [affectedRows] = await this.employeeModel.update(
            {
              locationID: row.locationId,
              sortOrder: String(row.sequence), // ← also update sequence
            },
            {
              where: {
                employeeCode: row.employeeCode,
                orgID: user.orgID,
              },
              transaction,
            },
          );
          if (affectedRows > 0) updatedEmployeeCount++;
        }

        await transaction.commit();

        return {
          message: `Zone assignment complete. ${updatedEmployeeCount} employee(s) updated successfully.`,
          updatedEmployees: updatedEmployeeCount,
        };
      } catch (error) {
        await transaction.rollback();
        throw new BadRequestException(`Import failed: ${error.message}`);
      }
    } catch (error) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  private async validateEmployeeZoneSheetData(
    sheetData: any[],
    user: any,
  ): Promise<IZoneRow[]> {
    const errors: string[] = [];
    const validatedData: IZoneRow[] = [];

    // ── Extract values for bulk DB lookups ──────────────────────
    const employeeCodes = sheetData.map((r) =>
      (r['Employee Code'] || '').toString().trim(),
    );
    const locationIds = sheetData.map((r) =>
      (r['Location Id'] || '').toString().trim(),
    );

    // ── Duplicate Employee Code check (within sheet) ─────────────
    const findDuplicates = (arr: string[]) =>
      arr.filter((item, idx) => item && arr.indexOf(item) !== idx);

    const duplicateEmployeeCodes = findDuplicates(employeeCodes);
    if (duplicateEmployeeCodes.length > 0) {
      errors.push(
        `Duplicate Employee Codes in sheet: ${[
          ...new Set(duplicateEmployeeCodes),
        ].join(', ')}`,
      );
    }

    // ── DB: verify Location Ids belong to this org ───────────────
    const uniqueLocationIds = [
      ...new Set(
        locationIds
          .filter(Boolean)
          .map(Number)
          .filter((n) => !isNaN(n)),
      ),
    ];

    const existingLocations = uniqueLocationIds.length
      ? await this.locationModel.findAll({
          where: {
            id: { [Op.in]: uniqueLocationIds },
            orgID: user.orgID,
            status: Status.Active,
          },
          attributes: ['id'],
        })
      : [];

    const validLocationIds = new Set(
      existingLocations.map((l) => Number(l.id)),
    );

    // ── DB: verify Employee Codes belong to this org ─────────────
    const uniqueEmployeeCodes = [...new Set(employeeCodes.filter(Boolean))];

    const existingEmployees = uniqueEmployeeCodes.length
      ? await this.employeeModel.findAll({
          where: {
            employeeCode: { [Op.in]: uniqueEmployeeCodes },
            orgID: user.orgID,
            // status: Status.Active,
            // employeeType: EmployeeType.Employee,
          },
          attributes: ['employeeCode'],
        })
      : [];

    const validEmployeeCodes = new Set(
      existingEmployees.map((e) => e.employeeCode),
    );

    // ── Per-zone sequence counter ─────────────────────────────────
    const zoneSequenceCounter = new Map<number, number>();

    // ── Per-row validation ────────────────────────────────────────
    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const rowNum = i + 2;
      const rowErrors: string[] = [];

      const employeeCode = (row['Employee Code'] || '').toString().trim();
      const locationIdRaw = (row['Location Id'] || '').toString().trim();

      // ── Required field checks ─────────────────────────────────
      if (!employeeCode) rowErrors.push('Employee Code is required');
      if (!locationIdRaw) rowErrors.push('Location Id is required');

      // ── Numeric check (only if value present) ─────────────────
      const locationId = Number(locationIdRaw);
      if (locationIdRaw && isNaN(locationId)) {
        rowErrors.push('Location Id must be a number');
      }

      // ── Org-level existence checks ────────────────────────────
      if (
        locationIdRaw &&
        !isNaN(locationId) &&
        !validLocationIds.has(locationId)
      ) {
        rowErrors.push(
          `Location Id ${locationId} does not exist in your organisation`,
        );
      }

      if (employeeCode && !validEmployeeCodes.has(employeeCode)) {
        rowErrors.push(
          `Employee Code ${employeeCode} does not exist in your organisation`,
        );
      }

      // ── Collect or push validated row ─────────────────────────
      if (rowErrors.length > 0) {
        errors.push(`Row ${rowNum}: ${rowErrors.join(', ')}`);
        continue;
      }

      const currentSeq = (zoneSequenceCounter.get(locationId) ?? 0) + 1;
      zoneSequenceCounter.set(locationId, currentSeq);

      validatedData.push({
        locationId,
        employeeCode,
        sequence: currentSeq,
      });
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }

    return validatedData;
  }

  async unassignEmployeesFromZone(
    employeeIds: string[],
    user: any,
  ): Promise<any> {
    try {
      if (!employeeIds || employeeIds.length === 0) {
        throw new BadRequestException('No employee IDs provided.');
      }
      const organization = await this.organizationService.findOne(user?.orgID);

      // Fetch employees before update for event log
      const employeesBefore = await this.employeeModel.findAll({
        where: {
          id: { [Op.in]: employeeIds },
          orgID: user.orgID,
        },
        attributes: ['id', 'name', 'employeeCode', 'locationID', 'sortOrder'],
      });

      if (employeesBefore.length === 0) {
        throw new BadRequestException('No matching employees found.');
      }

      // Check if any employee's current zone is locked
      const locationIds = [
        ...new Set(
          employeesBefore
            .map((e) => e.locationID)
            .filter((id) => id !== null && id !== undefined),
        ),
      ];

      if (locationIds.length > 0) {
        const lockedZones = await this.locationModel.findAll({
          where: {
            id: { [Op.in]: locationIds },
            orgID: user.orgID,
            isLocked: true,
          },
          attributes: ['id', 'name'],
        });

        if (lockedZones.length > 0) {
          const lockedNames = lockedZones
            .map((z) => `${z.name} (ID: ${z.id})`)
            .join(', ');
          throw new BadRequestException(
            `Cannot unassign employees from locked zone(s): ${lockedNames}.`,
          );
        }
      }

      //  Unassign: set locationID and sortOrder to null
      const [affectedCount] = await this.employeeModel.update(
        {
          locationID: null,
          sortOrder: null,
        },
        {
          where: {
            id: { [Op.in]: employeeIds },
            orgID: user.orgID,
          },
          returning: true,
        },
      );

      // Event log
      const eventLog = {
        objectType: 'Employee zone unassign',
        changeType: 'edit',
        objectID: organization.data.id,
        authID: user.id,
        orgID: user.orgID,
        updatedBy: user.name,
        payload: employeesBefore.map((e) => ({
          id: e.id,
          name: e.name,
          employeeCode: e.employeeCode,
          previousLocationID: e.locationID,
          previousSortOrder: e.sortOrder,
          locationID: null,
          sortOrder: null,
        })),
        requestPayload: { employeeIds },
        user,
      };
      await this.eventlogService.create(eventLog);

      return {
        success: true,
        message: `${affectedCount} employee(s) unassigned from zone successfully.`,
        unassignedCount: affectedCount,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(error);
    }
  }
}
function buildChangeDiff(
  existing: Record<string, any>,
  updateInput: Record<string, any>,
): { oldRecord: Record<string, any>; newRecord: Record<string, any> } {
  const oldRecord: Record<string, any> = {};
  const newRecord: Record<string, any> = {};

  const excludedFields = ['updatedAt', 'commuteDistance', 'commuteTime'];
  const dateFields = ['dob', 'joinedDate', 'exitDate'];

  const normalizeForCompare = (val: any): string => {
    if (val === null || val === undefined || val === '') return '';
    if (val instanceof Date) return moment(val).format('YYYY-MM-DD');
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      return moment(val).format('YYYY-MM-DD');
    }
    return String(val);
  };

  const formatForDisplay = (key: string, val: any): any => {
    if (val === null || val === undefined || val === '') return val;
    if (dateFields.includes(key)) {
      return moment(val).format('DD-MM-YYYY'); // ← display format for the email
    }
    return val;
  };

  Object.keys(updateInput).forEach((key) => {
    if (excludedFields.includes(key)) return;
    const newVal = updateInput[key];
    if (newVal === undefined) return;

    const oldVal = existing[key];

    const oldCompareStr = normalizeForCompare(oldVal);
    const newCompareStr = normalizeForCompare(newVal);

    if (oldCompareStr !== newCompareStr) {
      oldRecord[key] = formatForDisplay(key, oldVal);
      newRecord[key] = formatForDisplay(key, newVal);
    }
  });

  return { oldRecord, newRecord };
}
