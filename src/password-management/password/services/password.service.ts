import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as dayjs from 'dayjs';
import { CompanyConfiguration } from 'src/config-management/company-config/models/company-config.model';
import { ConfigurationMaster } from 'src/config-management/config/models/config.model';
import { Organization } from 'src/organization/models/organization.model';
import { PasswordHistory } from 'src/password-management/password-history/models/password-history.model';
import * as bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import sequelize from 'sequelize';
import { PasswordHistoryService } from 'src/password-management/password-history/services/password-history.service';
import { EmployeeService } from 'src/employee/services/employee-service';
import { generatePasswordInfoFromRegex } from 'src/shared/utils/regex-info';
import { ConfigurationService } from 'src/config-management/config/services/config.service';

@Injectable()
export class PasswordService {
  constructor(
    @InjectModel(ConfigurationMaster)
    private readonly configMasterModel: typeof ConfigurationMaster,
    @InjectModel(CompanyConfiguration)
    private readonly companyConfigurationModel: typeof CompanyConfiguration,
    @InjectModel(Organization)
    private readonly organizationModel: typeof Organization,
    @InjectModel(PasswordHistory)
    private readonly passwordHistoryModel: typeof PasswordHistory,
    private passwordHistoryService: PasswordHistoryService,
    private employeeService: EmployeeService,
    private configurationService: ConfigurationService,
  ) {}

  private async validateOrganization(organizationId: bigint): Promise<void> {
    const organization = await this.organizationModel.findByPk(organizationId);
    if (!organization) {
      throw new BadRequestException(
        `Organization with ID ${organizationId} not found.`,
      );
    }
  }

  async getConfigValue(
    configName: string,
    organizationId?: bigint,
  ): Promise<string> {
    try {
      const config = await this.configMasterModel.findOne({
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
        const companyConfig = await this.companyConfigurationModel.findOne({
          where: {
            configID: config.id,
            orgID: organizationId,
          },
        });
        if (companyConfig?.configValue) {
          return companyConfig.configValue;
        }
        // else {
        // throw new BadRequestException(
        //   `Configuration not found for this organization`,
        // );
        // }
      }

      if (config.defaultValue) {
        return config.defaultValue;
      } else {
        throw new NotFoundException(
          `Default configuration for '${configName}' not set.`,
        );
      }
    } catch (error) {
      throw error;
    }
  }

  async getPasswordExpiryDays(organizationId?: bigint): Promise<number> {
    const value = await this.getConfigValue('PASSWORD_EXPIRY', organizationId);
    const parsedValue = parseInt(value, 10);
    return !isNaN(parsedValue) ? parsedValue : 90;
  }

  async getPasswordStrengthRegex(organizationId?: bigint): Promise<RegExp> {
    const value = await this.getConfigValue(
      'PASSWORD_STRENGTH',
      organizationId,
    );
    const cleanedValue = value.trim().replace(/^\/(.*)\/$/, '$1');
    try {
      return new RegExp(cleanedValue);
    } catch (error) {
      throw new Error('Invalid regex pattern in configuration');
    }
  }

  async isPasswordExpired(
    createdDate: Date,
    organizationId?: bigint,
  ): Promise<boolean> {
    await this.validateOrganization(organizationId);
    const expiryDays = await this.getPasswordExpiryDays(organizationId);
    const expiryDate = dayjs(createdDate).add(expiryDays, 'day');
    return dayjs().isAfter(expiryDate);
  }

  async checkPasswordExists(employeeID: bigint, passwordCreatedAt: Date) {
    const passwordHistory = await this.passwordHistoryService.findByEmployeeId(
      employeeID,
    );
    const employee = await this.employeeService.findOne(employeeID);
    if (employee.data?.orgID) {
      return (
        passwordHistory.length &&
        (await this.isPasswordExpired(passwordCreatedAt, employee.data?.orgID))
      );
    } else {
      throw new Error('Employee not in an organization');
    }
  }

  async checkPasswordExpiryByDefault(
    passwordCreatedAt: Date,
  ): Promise<boolean> {
    if (!passwordCreatedAt) return false; // no password set yet

    // Fetch default expiry days from config (no orgID)
    const config = await this.configurationService.findOneByConfigName(
      'PASSWORD_EXPIRY',
    );
    const expiryDays = parseInt(config.data.defaultValue, 10);
    // config?.data?.defaultValue? parseInt(config.data.defaultValue, 10) : 90;

    const expiryDate = dayjs(passwordCreatedAt).add(expiryDays, 'day');
    return dayjs().isAfter(expiryDate);
  }

  async isPasswordStrong(
    password: string,
    organizationId?: bigint,
  ): Promise<any> {
    try {
      // if (organizationId) {
      const regex = await this.getPasswordStrengthRegex(organizationId);
      const isValid = regex.test(password);
      const info = generatePasswordInfoFromRegex(regex);
      if (!isValid) {
        return {
          fieldName: 'password',
          error: false,
          info: info,
          message: `Password does not meet the required strength criteria.${info}`,
        };
      }

      return {
        error: true,
        message: 'Password meet the required strength criteria.',
      };
    } catch (error) {
      // else {
      //   const regex =
      //     /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      //   const isValid = regex.test(password);
      //   const info = generatePasswordInfoFromRegex(regex);
      //   if (!isValid) {
      //     return {
      //       fieldName: 'password',
      //       error: false,
      //       info: info,
      //       message: 'Password does not meet the required strength criteria.',
      //     };
      //   }

      //     return {
      //       error: true,
      //       message: 'Password meet the required strength criteria.',
      //     };
      //   }
      // }
      throw error;
    }
  }

  // async isPasswordReused(
  //   employeeID: bigint,
  //   newPassword: string,
  //   organizationID: bigint,
  // ): Promise<boolean> {
  //   const value = await this.getConfigValue(
  //     'PASSWORD_HISTORY_LIMIT',
  //     organizationID,
  //   );
  //   const limit = value ? parseInt(value, 10) : 3;

  //   const passwordHistory = await this.passwordHistoryModel.findAll({
  //     where: { employeeID },
  //     order: [['createdDate', 'DESC']],
  //     limit: limit,
  //   });

  //   if (passwordHistory.length < limit) {
  //     return false;
  //   }

  //   for (const record of passwordHistory) {
  //     const isMatch = await bcrypt.compare(newPassword, record.hashedPassword);
  //     if (isMatch) {
  //       return true;
  //     }
  //   }

  //   return false;
  // }

  async isPasswordReused(
    employeeID: bigint,
    newPassword: string,
    organizationID: bigint,
    authID?: bigint, // Add this for SuperAdmin
  ): Promise<boolean> {
    let limit = 3;

    if (organizationID) {
      // Regular org user — fetch org-specific value

      const value = await this.getConfigValue(
        'PASSWORD_HISTORY_LIMIT',
        organizationID,
      );
      limit = parseInt(value, 10);
    } else {
      // SuperAdmin — no orgID, fetch default value from config
      const config = await this.configurationService.findOneByConfigName(
        'PASSWORD_HISTORY_LIMIT',
      ); // fetch full config row

      limit = parseInt(config.data.defaultValue, 10);
    }
    const passwordHistory = await this.passwordHistoryModel.findAll({
      where: employeeID ? { employeeID } : { authID },
      order: [['createdDate', 'DESC']],
      limit: limit,
    });

    if (passwordHistory.length < limit) {
      return false;
    }

    for (const record of passwordHistory) {
      const isMatch = await bcrypt.compare(newPassword, record.hashedPassword);
      if (isMatch) {
        return true;
      }
    }

    return false;
  }
}
