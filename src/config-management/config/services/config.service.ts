import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { literal, Op } from 'sequelize';
import { ConfigurationMaster } from '../models/config.model';
import { CreateConfigInput } from '../dtos/create-config-input.dto';
import { UpdateConfigInput } from '../dtos/update-config-input.dto';
import { ConfigFilterInput } from '../dtos/config-filter-input.dts';
import { SortOrder, UserType } from 'src/shared/enums';
import { CompanyConfigService } from 'src/config-management/company-config/services/company-config.service';
import { CompanyConfiguration } from 'src/config-management/company-config/models/company-config.model';
import sequelize from 'sequelize';
import { Organization } from 'src/organization/models/organization.model';
import { v4 as uuidv4 } from 'uuid';
import { DriverMultipleConfigValuesDto } from '../dtos/get-configs-input-driver.dto';
import { OrganizationDriver } from 'src/organization-driver/models/organizationDriver.model';
import { EmailService } from 'src/email/email.service';
import { Employee } from 'src/employee/models/employee.model';
import { EventLogService } from 'src/eventlog/eventlog.service';

@Injectable()
export class ConfigurationService {
  private logger = new Logger(ConfigurationService.name);

  constructor(
    @InjectModel(ConfigurationMaster)
    private configModel: typeof ConfigurationMaster,
    private companyConfigService: CompanyConfigService,
    private readonly emailService: EmailService,
    @InjectModel(CompanyConfiguration)
    private readonly companyConfigModel: typeof CompanyConfiguration,
    @InjectModel(Organization)
    private readonly organizationModal: typeof Organization,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(OrganizationDriver)
    private readonly organizationDriverModal: typeof OrganizationDriver,
    private eventlogService: EventLogService,
  ) {}

  async create(
    createConfigInput: CreateConfigInput,
    currentUser: any,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    try {
      const { configName } = createConfigInput;
      const existingConfig = await this.configModel.findOne({
        where: {
          configName,
        },
      });

      if (existingConfig) {
        throw new NotFoundException(
          'A configuration with this name already exists.',
        );
      }

      const config = await this.configModel.create({
        ...createConfigInput,
        createdBy:
          currentUser.userType == UserType.SuperAdmin ? null : currentUser.id,
      });

      const configValueForLog = Array.isArray(config.configValue)
        ? config.configValue.join(',')
        : config.configValue;

      this.eventlogService.create({
        objectType: 'Configuration',
        changeType: 'add',
        objectID: config.id,
        authID: currentUser.id,
        orgID: currentUser?.orgID,
        updatedBy: currentUser.name,
        payload: {
          configID: config.id,
          configName: config.configName,
          configValue: configValueForLog,
        },
        requestPayload: JSON.parse(JSON.stringify(createConfigInput)),
        customDescription: `created new config "${config.configName}"`,
        user: currentUser,
      });

      return {
        message: 'Configuration created successfully',
        data: config,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getMultipleConfigValues(
    configNames: string[],
    user: any,
  ): Promise<GenericResponse<any>> {
    try {
      if (!configNames || configNames.length === 0) {
        throw new BadRequestException('Config names cannot be empty.');
      }
      const masterConfigs = await this.configModel.findAll({
        where: {
          [Op.or]: configNames.map((name) =>
            sequelize.where(
              // Normalize DB column: lowercase + replace underscores with spaces
              sequelize.fn(
                'REPLACE',
                sequelize.fn('LOWER', sequelize.col('configName')),
                '_',
                ' ',
              ),
              // Normalize input: lowercase + replace underscores with spaces
              name.toLowerCase().replace(/\_+/g, ' '),
            ),
          ),
        },
      });
      const configIDs = masterConfigs.map((masterConfig) => masterConfig.id);
      const companyConfigs = await this.companyConfigModel.findAll({
        where: { configID: configIDs, orgID: user?.orgID },
      });
      const companyMap = new Map(
        companyConfigs.map((compConfig) => [
          String(compConfig.configID),
          compConfig.configValue,
        ]),
      );
      const response: Record<string, any> = {};
      masterConfigs.forEach((master) => {
        const value = companyMap.get(String(master.id)) ?? master.defaultValue;
        response[master.configName] = value;
      });
      return {
        message: 'Configurations fetched successfully',
        data: response,
      };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async getDriverMultipleConfigValues(
    driverConfigDto: DriverMultipleConfigValuesDto,
    user: any,
  ): Promise<GenericResponse<any>> {
    try {
      const driver = await this.organizationDriverModal.findOne({
        where: {
          driverID: user?.driverID,
          status: 'Approved',
          orgID: driverConfigDto.orgID,
        },
      });
      if (!driver) {
        throw new Error('You are not associated to this organization');
      }
      const org = await this.organizationModal.findOne({
        where: { id: driverConfigDto.orgID },
      });
      if (!org) {
        throw new Error('Invalid orgID');
      }
      if (
        !driverConfigDto.configNames ||
        driverConfigDto.configNames.length === 0
      ) {
        throw new BadRequestException('Config names cannot be empty.');
      }
      const masterConfigs = await this.configModel.findAll({
        where: {
          [Op.or]: driverConfigDto.configNames?.map((name) =>
            sequelize.where(
              // Normalize DB column: lowercase + replace underscores with spaces
              sequelize.fn(
                'REPLACE',
                sequelize.fn('LOWER', sequelize.col('configName')),
                '_',
                ' ',
              ),
              // Normalize input: lowercase + replace underscores with spaces
              name.toLowerCase().replace(/\_+/g, ' '),
            ),
          ),
        },
      });

      // Check which config names not found in DB
      const foundNormalizedNames = new Set(
        masterConfigs.map((mc) =>
          mc.configName.toLowerCase().replace(/_+/g, ' '),
        ),
      );
      const notFoundNames = driverConfigDto.configNames.filter(
        (name) =>
          !foundNormalizedNames.has(name.toLowerCase().replace(/_+/g, ' ')),
      );
      if (notFoundNames.length > 0) {
        throw new BadRequestException(
          `The following config names do not exist: ${notFoundNames.join(
            ', ',
          )}`,
        );
      }
      const configIDs = masterConfigs.map((masterConfig) => masterConfig.id);
      const companyConfigs = await this.companyConfigModel.findAll({
        where: { configID: configIDs, orgID: driverConfigDto?.orgID },
      });
      const companyMap = new Map(
        companyConfigs.map((compConfig) => [
          String(compConfig.configID),
          compConfig.configValue,
        ]),
      );
      const response: Record<string, any> = {};
      masterConfigs.forEach((master) => {
        const value = companyMap.get(String(master.id)) ?? master.defaultValue;
        response[master.configName] = value;
      });
      return {
        message: 'Configurations fetched successfully',
        data: response,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  // async findAll(
  //   configFilterInput: ConfigFilterInput,
  //   user: any,
  // ): Promise<PaginatedList<ConfigurationMaster>> {
  //   try {
  //     const {
  //       take = 25,
  //       skip = 0,
  //       sortBy = 'id',
  //       sortOrder = SortOrder.DESC,
  //       search,
  //     } = configFilterInput;
  //     const whereClause: any = {};
  //     if (search) {
  //       whereClause.name = {
  //         [Op.iLike]: `%${search}%`,
  //       };
  //     }

  //     const config = await this.configModel.findAndCountAll({
  //       attributes: [
  //         'configName',
  //         'id',
  //         [literal(`array_to_string("configValue", ', ')`), 'configValue'], // Convert array to comma-separated string
  //         'defaultValue',
  //         'editable',
  //         'viewable',
  //         'status',
  //         'notes',
  //       ],
  //       distinct: true,
  //       order: [[`${sortBy}`, `${sortOrder}`]],
  //       // order: [
  //       //   sortBy === 'configValue'
  //       //     ? [literal(`array_to_string("configValue", ', ')`), sortOrder]
  //       //     : [sortBy, sortOrder],
  //       // ],

  //       limit: take,
  //       offset: skip * take,
  //       where: whereClause,
  //     });

  //     const configIds = config.rows.map((c) => c.id);
  //     const whereCompanyConfig: any = {
  //       configID: { [Op.in]: configIds },
  //     };

  //     if (user?.orgID) {
  //       whereCompanyConfig.orgID = user?.orgID;
  //     }

  //     const companyConfigs = await this.companyConfigModel.findAll({
  //       attributes: ['configID', 'configValue'],
  //       where: whereCompanyConfig,
  //     });
  //     const companyConfigMap = companyConfigs.reduce((acc, cc) => {
  //       acc[cc.configID] = cc.configValue;
  //       return acc;
  //     }, {});

  //     const mergedItems = config.rows.map((configItem) => {
  //       const companyValue = companyConfigMap[configItem.id];
  //       return {
  //         ...configItem.get({ plain: true }),
  //         defaultValue: companyValue ?? configItem.defaultValue,
  //         configValue: companyValue ?? configItem.configValue,
  //       } as ConfigurationMaster;
  //     });
  //     console.log('-------------------mergedItems--------',mergedItems.length)
  //     return {
  //       totalItems: user?.orgID ? mergedItems.length : config.count,
  //       items: user?.orgID ? mergedItems : config.rows,
  //     };
  //   } catch (error) {
  //     if (error.status !== 500) {
  //       throw error;
  //     }
  //     throw new InternalServerErrorException(error);
  //   }
  // }

  async findAll(
    configFilterInput: ConfigFilterInput,
    user: any,
  ): Promise<PaginatedList<ConfigurationMaster>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
      } = configFilterInput;

      const whereMaster: any = {};
      if (user.orgID) {
        whereMaster.viewable = true;
      }

      if (search) {
        whereMaster.configName = {
          [Op.iLike]: `%${search}%`,
        };
      }
      const config = await this.configModel.findAndCountAll({
        where: whereMaster,
        attributes: [
          'id',
          'configName',
          [literal(`array_to_string("configValue", ', ')`), 'configValue'], // Convert array to comma-separated string
          'defaultValue',
          'editable',
          'viewable',
          'status',
          'notes',
        ],
        include: [
          {
            model: this.companyConfigModel,
            as: 'companyConfiguration',
            required: false, // LEFT JOIN
            attributes: ['configValue'],
            where: {
              orgID: user.orgID,
            },
          },
        ],
        order: [[sortBy, sortOrder]],
        limit: take,
        offset: skip * take,
        distinct: true,
      });

      const items: ConfigurationMaster[] = config.rows.map((row) => {
        const plain = row.get({ plain: true });

        const companyValue = plain.companyConfiguration?.[0]?.configValue;
        // return {
        //   ...plain,
        //   configValue: companyValue ?? plain.defaultValue,
        //   defaultValue: companyValue ?? plain.defaultValue,
        // } as ConfigurationMaster;
        const finalConfigValue = user?.orgID
          ? companyValue ?? plain.defaultValue // org user
          : plain.configValue; // super admin

        return {
          ...plain,
          configValue: finalConfigValue,
          defaultValue: plain.defaultValue,
        } as ConfigurationMaster;
      });
      return {
        totalItems: config.count,
        items,
      };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }
  async findOne(
    id: string,
    user: any,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    try {
      const config = await this.configModel.findOne({
        where: { id },
        order: [['createdAt', 'DESC']],
        attributes: [
          'id',
          'configName',
          'configValue',
          'defaultValue',
          'status',
          'editable',
          'viewable',
          'notes',
        ],
        include: user?.orgID && [
          {
            model: CompanyConfiguration,
            where: { configID: id, orgID: user?.orgID },
            required: false,
            attributes: ['configValue'],
          },
        ],
      });

      if (!config) {
        throw new NotFoundException('Config not found');
      }

      const companyValue = config?.companyConfiguration?.[0]?.configValue;
      const updatedConfig = {
        ...config.get({ plain: true }),
        defaultValue: companyValue ?? config.defaultValue,
        configValue: companyValue ?? config.configValue,
      } as ConfigurationMaster;

      if (config) {
        return {
          message: 'Config found',
          data: updatedConfig,
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

  async findOneMasterConfig(
    configName: string,
    // user: any,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    try {
      const config = await this.configModel.findOne({
        where: sequelize.where(
          sequelize.fn(
            'REPLACE',
            sequelize.fn('LOWER', sequelize.col('configName')),
            '_',
            ' ',
          ),
          configName.toLowerCase().replace(/\_+/g, ' '),
        ),
        order: [['createdAt', 'DESC']],
        attributes: [
          'id',
          'configName',
          'configValue',
          'defaultValue',
          'status',
          'editable',
          'viewable',
          'notes',
        ],
      });

      if (!config) {
        throw new NotFoundException('Config not found');
      }

      const updatedConfig = {
        ...config.get({ plain: true }),
        configValue: config.configValue,
        defaultValue: config.defaultValue,
      } as ConfigurationMaster;

      return {
        message: 'Config found',
        data: updatedConfig,
      };
    } catch (error) {
      if (error.status !== 500) throw error;
      throw new InternalServerErrorException(error);
    }
  }

  async findOneByConfigName(
    configName: string,
    user?: any,
  ): Promise<GenericResponse<ConfigurationMaster>> {
    try {
      const config = await this.configModel.findOne({
        where: {
          [Op.and]: [
            // sequelize.where(
            //   sequelize.fn('LOWER', sequelize.col('configName')),
            //   configName.toLowerCase().replace(/\_+/g, ' '),
            // ),
            sequelize.where(
              sequelize.fn(
                'REPLACE',
                sequelize.fn('LOWER', sequelize.col('configName')),
                '_',
                ' ',
              ),
              configName.toLowerCase().replace(/\_+/g, ' '),
            ),
          ],
        },
        attributes: [
          'id',
          'configName',
          'configValue',
          'defaultValue',
          'status',
          'editable',
          'viewable',
          'notes',
        ],
        include: user?.orgID && [
          {
            model: CompanyConfiguration,
            where: {
              orgID: user?.orgID,
            },
            required: false,
            attributes: ['configValue'],
          },
        ],
      });

      if (!config) {
        throw new NotFoundException('Config not found');
      }

      const companyValue = config?.companyConfiguration?.[0]?.configValue;

      const updatedConfig = {
        ...config.get({ plain: true }),
        configValue: companyValue ?? config.configValue,
        defaultValue: companyValue ? config.defaultValue : config.defaultValue,
      } as ConfigurationMaster;

      return {
        message: 'Config found',
        data: updatedConfig,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(
    id: string,
    updateConfigInput: UpdateConfigInput,
    user: any,
  ): Promise<any> {
    try {
      const { configName } = updateConfigInput;
      const existingConfig = await this.configModel.findOne({
        where: {
          configName,
          id: { [Op.ne]: id },
        },
      });
      if (existingConfig) {
        throw new NotFoundException('A config with this name already exists.');
      } else {
        // Fetched before either update path runs, so both branches have
        // a real "previous value" to log — the SuperAdmin branch
        // previously had no old-value source at all.
        const configBeforeUpdate = await this.configModel.findOne({
          where: { id },
        });
        const previousValue = Array.isArray(configBeforeUpdate?.configValue)
          ? configBeforeUpdate.configValue.join(',')
          : configBeforeUpdate?.configValue;

        const config =
          user.userType === UserType.SuperAdmin &&
          (await this.configModel.update(
            {
              ...updateConfigInput,
            },
            {
              where: { id },
              returning: true,
            },
          ));

        let newValueForLog: any = Array.isArray(updateConfigInput.configValue)
          ? updateConfigInput.configValue.join(',')
          : updateConfigInput.configValue;

        if (user.userType != UserType.SuperAdmin) {
          const currentCompanyConfig =
            await this.companyConfigService.findByConfigId?.(id, user?.orgID);
          const oldValue = currentCompanyConfig?.configValue;

          const newValue = Array.isArray(updateConfigInput.configValue)
            ? updateConfigInput.configValue.join(',')
            : updateConfigInput.configValue;
          await this.companyConfigService.deleteByConfigId(id, user?.orgID);
          await this.companyConfigService.create(
            {
              configID: BigInt(id),
              configValue: Array.isArray(updateConfigInput.configValue)
                ? updateConfigInput.configValue.join(',')
                : updateConfigInput.configValue,
              orgID: user?.orgID,
            },
            user,
          );
          // Org-scoped path's real old/new values — more accurate than
          // configBeforeUpdate above for this branch, since that read
          // the ConfigurationMaster row, not the org's CompanyConfiguration
          // override.
          newValueForLog = newValue;
          if (oldValue !== newValue) {
            const [org, updatedByUser] = await Promise.all([
              this.organizationModal.findOne({
                where: { id: user?.orgID },
                attributes: ['name'],
              }),
              this.employeeModel.findOne({
                where: { orgID: user?.orgID, employeeType: UserType.Admin },
                attributes: ['name', 'email'],
              }),
            ]);
            this.sendConfigChangeEmail({
              configName,
              oldValue,
              newValue,
              orgID: user?.orgID,
              orgName: org?.name,
              changedByUsername: updatedByUser?.name,
              changedByEmail: updatedByUser?.email,
            });
          }

          this.eventlogService.create({
            objectType: 'Configuration',
            changeType: 'edit',
            objectID: id,
            authID: user.id,
            orgID: user?.orgID,
            updatedBy: user.name,
            payload: { configID: id, configName },
            requestPayload: JSON.parse(JSON.stringify(updateConfigInput)),
            changeJSON: {
              [configName]: { OldValue: oldValue, newValue },
            },
            customDescription: `updated config "${configName}"`,
            user,
          });
        } else {
          this.eventlogService.create({
            objectType: 'Configuration',
            changeType: 'edit',
            objectID: id,
            authID: user.id,
            orgID: user?.orgID,
            updatedBy: user.name,
            payload: { configID: id, configName },
            requestPayload: JSON.parse(JSON.stringify(updateConfigInput)),
            changeJSON: {
              [configName]: {
                OldValue: previousValue,
                newValue: newValueForLog,
              },
            },
            customDescription: `updated config "${configName}"`,
            user,
          });
        }

        return {
          message: 'Config updated successfully',
          data: config?.[1]?.[0],
        };
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  private async sendConfigChangeEmail(params: {
    configName: string;
    oldValue?: string;
    newValue?: string;
    orgID?: string;
    orgName?: string;
    changedByUsername?: string;
    changedByEmail?: string;
  }): Promise<void> {
    const {
      configName,
      oldValue,
      newValue,
      orgID,
      orgName,
      changedByUsername,
      changedByEmail,
    } = params;
    try {
      const emailRecipientsConfig = await this.getConfigValue(
        'ADMIN_EMAIL_ALERT_RECIPIENTS',
        BigInt(orgID),
      );

      if (!emailRecipientsConfig) {
        this.logger.warn(
          `[CONFIG CHANGE EMAIL] No recipients configured for org ${orgID}. Skipping.`,
        );
        return;
      }
      const emailRecipients = emailRecipientsConfig
        .split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      if (emailRecipients.length === 0) {
        this.logger.warn(
          `[CONFIG CHANGE EMAIL] Empty recipients list for org ${orgID}. Skipping.`,
        );
        return;
      }

      await this.emailService.sendEmail({
        mailTo: emailRecipients,
        subject: `Configuration value update - ${orgName ?? ''}`,
        templateName: 'config-update-alert',
        mailBody: {
          orgName: orgName ?? 'N/A',
          configName,
          oldValue: oldValue ?? 'N/A',
          newValue: newValue ?? 'N/A',
          changedByName: changedByUsername ?? 'N/A',
          changedByEmail,
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
        `[CONFIG CHANGE EMAIL] Config change email sent successfully for org ${orgID}`,
      );
    } catch (error) {
      this.logger.error(
        `[CONFIG CHANGE EMAIL] Failed to send config change email for org ${orgID}:`,
        error,
      );
    }
  }

  async delete(id: string): Promise<GenericResponse<null>> {
    try {
      await this.configModel.destroy({
        where: {
          id,
        },
      });
      return {
        message: 'Config deleted successfully',
        data: null,
      };
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getShiftConfigValue(user: any, configName?: string): Promise<any> {
    try {
      const config = await this.configModel.findOne({
        where: {
          [Op.and]: [
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('configName')),
              configName.toLowerCase().replace(/\_+/g, ' '),
            ),
          ],
        },
      });
      if (!config) {
        throw new BadRequestException(
          `Configuration for ${configName} not found.`,
        );
      }

      if (user?.orgID) {
        const companyConfig = await this.companyConfigModel.findOne({
          where: {
            configID: config.id,
            orgID: user?.orgID,
          },
        });
        function parseTimeConfig(configValue: string | string[]): string[] {
          if (Array.isArray(configValue)) {
            // Check if it's already in correct format
            const isValid = configValue.every((time) =>
              /^\d{1,2}:\d{2}$/.test(time),
            );
            return isValid ? configValue : [];
          }

          if (typeof configValue === 'string') {
            const parts = configValue.split(',');
            const isValid = parts.every((time) => /^\d{1,2}:\d{2}$/.test(time));
            return isValid ? parts : [];
          }

          // Fallback for anything unexpected
          return [];
        }
        if (companyConfig) {
          return parseTimeConfig(companyConfig.configValue);
        }
      }
      if (config.defaultValue) {
        return configName === 'login time' || configName === 'logout time'
          ? config.configValue
          : config.defaultValue;
      } else {
        throw new NotFoundException(
          `Default configuration for '${configName}' not set.`,
        );
      }
    } catch (error) {
      throw error;
    }
  }

  async getConfigValue(
    configName: string,
    organizationId?: bigint,
  ): Promise<string> {
    try {
      const config = await this.configModel.findOne({
        where: {
          [Op.and]: [
            // sequelize.where(
            //   sequelize.fn('LOWER', sequelize.col('configName')),
            //   configName.toLowerCase().replace(/\_+/g, ' '),
            // ),
            sequelize.where(
              sequelize.fn(
                'REPLACE',
                sequelize.fn('LOWER', sequelize.col('configName')),
                '_',
                ' ',
              ),
              configName.toLowerCase().replace(/\_+/g, ' '),
            ),
          ],
        },
      });
      if (!config) {
        throw new BadRequestException(
          `Configuration for ${configName} not found.`,
        );
      }
      if (organizationId) {
        const companyConfig = await this.companyConfigModel.findOne({
          where: {
            configID: config.id,
            orgID: organizationId,
          },
        });
        if (companyConfig) {
          return companyConfig.configValue;
        }
      }

      if (config.defaultValue) {
        return config.defaultValue;
      } else {
        // throw new NotFoundException(
        //   `Default configuration for '${configName}' not set.`,
        // );
        return null;
      }
    } catch (error) {
      throw error;
    }
  }

  // Provisioning probe: does THIS org hold its own CompanyConfiguration row
  // for every one of these keys? getConfigValue collapses "org override" and
  // "global default" into a single string, so a caller that must tell them
  // apart cannot use it. Written as a separate read rather than a refactor of
  // getConfigValue, whose matching semantics every config key in the system
  // depends on. The normalization below is duplicated from getConfigValue for
  // exactly that reason - keep the two in step if either ever changes.
  async hasOrgConfigOverrides(
    configNames: string[],
    organizationId?: bigint,
  ): Promise<boolean> {
    if (!organizationId || !configNames?.length) {
      return false;
    }

    const masterConfigs = await this.configModel.findAll({
      where: {
        [Op.or]: configNames.map((name) =>
          sequelize.where(
            sequelize.fn(
              'REPLACE',
              sequelize.fn('LOWER', sequelize.col('configName')),
              '_',
              ' ',
            ),
            name.toLowerCase().replace(/\_+/g, ' '),
          ),
        ),
      },
      attributes: ['id'],
    });

    // A missing master row means the key was never created, which is not
    // something an org override can compensate for.
    if (masterConfigs.length !== configNames.length) {
      return false;
    }

    const overrideCount = await this.companyConfigModel.count({
      where: {
        configID: masterConfigs.map((config) => config.id),
        orgID: organizationId,
      },
      distinct: true,
      col: 'configID',
    });

    return overrideCount === masterConfigs.length;
  }

  async getMedicalAndAdhoc(user?: any): Promise<any[]> {
    try {
      const configs = await this.configModel.findAll({
        where: {
          configName: {
            [Op.in]: ['AdHoc', 'Medical'],
          },
        },
      });
      if (!configs.length) {
        throw new BadRequestException(`Configuration not found.`);
      }
      const configIds = configs.map((config: any) => config.id);
      const activeConfigs = new Set<{ label: string; value: string }>();

      if (user?.orgID) {
        const companyConfigs = await this.companyConfigModel.findAll({
          where: {
            configID: {
              [Op.in]: configIds,
            },
            orgID: user?.orgID,
          },
        });

        const companyConfigIds = new Set(
          companyConfigs.map((cc) => cc.configID),
        );

        companyConfigs.forEach((cc) => {
          if (cc.configValue === 'Yes') {
            const matchedConfig = configs.find(
              (c) => c.id.toString() === cc.configID,
            );
            if (matchedConfig) {
              activeConfigs.add({
                label: matchedConfig.configName,
                value: matchedConfig.configName,
              });
            }
          }
        });
        configs.forEach((c) => {
          if (!companyConfigIds.has(c.id.toString())) {
            activeConfigs.add({
              label: c.configName,
              value: c.configName,
            });
          }
        });
      }

      // if (!activeConfigs.size) {
      //   configs.forEach((config) => {
      //     if (config.defaultValue === 'Yes') {
      //       activeConfigs.add({
      //         label: config.configName,
      //         value: config.configName,
      //       });
      //     }
      //   });
      // }

      if (!activeConfigs.size) {
        throw new NotFoundException(`No active configurations found.`);
      }

      return Array.from(activeConfigs);
    } catch (error) {
      throw error;
    }
  }

  async getCutOff(type: string, user?: any): Promise<any> {
    try {
      const organizationId = user?.orgID;
      const config = await this.configModel.findOne({
        where: {
          configName: type,
        },
      });
      if (!config) {
        throw new BadRequestException(`Configuration not found.`);
      }
      if (organizationId) {
        const companyConfig = await this.companyConfigModel.findOne({
          where: {
            configID: config.id,
            orgID: organizationId,
          },
        });
        if (companyConfig) {
          return companyConfig.configValue;
        }
      }

      if (config.defaultValue) {
        return config.defaultValue;
      } else {
        throw new NotFoundException(
          `Default configuration for '${type}' not set.`,
        );
      }
    } catch (error) {
      throw error;
    }
  }

  async updateNoOfCabsConfig(configData: string, user: any): Promise<any> {
    try {
      const configDetails = await this.configModel.findOne({
        where: {
          configName: 'No of Cabs',
        },
      });
      await this.companyConfigService.deleteByConfigId(
        configDetails.id.toString(),
        user?.orgID,
      );
      await this.companyConfigService.create(
        {
          configID: BigInt(configDetails.id),
          configValue: configData,
          orgID: user?.orgID,
        },
        user,
      );
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async organizationGroups(configData: string, user: any): Promise<any> {
    try {
      const configIdString = await this.getConfigValue(configData, user?.orgID);
      if (configIdString) {
        const configIds = configIdString
          .split(',')
          .map((id) => Number(id.trim()))
          .filter((id) => !isNaN(id));

        let oraganizations = null;
        if (configIds.length > 0) {
          oraganizations = await this.organizationModal.findAll({
            where: {
              id: {
                [Op.in]: configIds,
              },
            },
          });
        }
        return oraganizations;
      } else {
        return null;
      }
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getEmergencyCutOffValue(
    configName: string,
    organizationId?: any,
  ): Promise<string> {
    try {
      const config = await this.configModel.findOne({
        where: {
          [Op.and]: [
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('configName')),
              configName.toLowerCase().replace(/\_+/g, ' '),
            ),
          ],
        },
      });
      if (!config) {
        throw new BadRequestException(
          `Configuration for ${configName} not found.`,
        );
      }
      if (organizationId) {
        const companyConfig = await this.companyConfigModel.findOne({
          where: {
            configID: config.id,
            orgID: organizationId,
          },
        });
        if (companyConfig) {
          return companyConfig.configValue;
        }
      }

      if (config.defaultValue) {
        return config.defaultValue;
      } else {
        // throw new NotFoundException(
        //   `Default configuration for '${configName}' not set.`,
        // );
        return null;
      }
    } catch (error) {
      throw error;
    }
  }

  async getByDomain(domain: string): Promise<any> {
    const orgRecord = await this.organizationModal.findOne({
      where: { domainName: domain },
    });
    if (!orgRecord) {
      return { OKTA_ENABLED: false };
    }
    const orgID = orgRecord.id;
    const oktaEnabledValue = await this.getConfigValue('OKTA_ENABLED', orgID);

    const isEnabled = oktaEnabledValue === '1';
    if (!isEnabled) {
      return { OKTA_ENABLED: false };
    }
    // const [clientID, redirectURI, oktaIssuer] = await Promise.all([
    //   this.getConfigValue('OKTA_CLIENT_ID', orgID),
    //   this.getConfigValue('OKTA_REDIRECT_URI', orgID),
    //   this.getConfigValue('OKTA_ISSUER', orgID),
    // ]);
    const configValues = await this.getMultipleConfigValues(
      ['OKTA_ENABLED', 'OKTA_CLIENT_ID', 'OKTA_REDIRECT_URI', 'OKTA_ISSUER'],
      { orgID: orgID },
    );

    const {
      OKTA_CLIENT_ID: clientID,
      OKTA_REDIRECT_URI: redirectURI,
      OKTA_ISSUER: oktaIssuer,
    } = configValues?.data || {};

    // 4. Validate mandatory configs
    if (!clientID || !redirectURI || !oktaIssuer) {
      return { OKTA_ENABLED: false };
    }
    // 5. Build Okta login URL
    const oktaLoginUrl = new URL(`${oktaIssuer}/oauth2/v1/authorize`);

    oktaLoginUrl.search = new URLSearchParams({
      client_id: clientID,
      response_type: 'code',
      redirect_uri: redirectURI,
      scope: 'openid profile email',
      state: uuidv4(),
    }).toString();

    return {
      OKTA_ENABLED: true,
      loginURL: oktaLoginUrl.toString(),
    };
  }
}
