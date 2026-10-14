// src/vendor-management/vendor-access/services/vendor-access.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import * as crypto from 'crypto';
import { PasswordService } from 'src/password-management/password/services/password.service';
import { VendorAccess } from '../models/vendor-access.model';
import { Authentication } from 'src/auth/models/authentication.model';
import { AuthService } from 'src/auth/services/auth.service';
import { SessionService } from 'src/auth/services/session.service';
import { EndPoint, Status, UserType, RequestStatus } from 'src/shared/enums';
import { VendorRequest } from 'src/vendor-management/vendor-request/models/vendor-request.model';
import {
  AddVendorAccessInput,
  UpdateVendorAccessInput,
} from '../dtos/vendor-access-input.dto';

@Injectable()
export class VendorAccessService {
  constructor(
    @InjectModel(VendorAccess) private vendorAccessModel: typeof VendorAccess,
    @InjectModel(Authentication) private authModel: typeof Authentication,
    @InjectModel(VendorRequest)
    private vendorRequestModel: typeof VendorRequest,
    private authService: AuthService,
    private sessionService: SessionService,
    private passwordService: PasswordService,
  ) {}

  /**
   * Returns the org IDs the *inviting* user (currentUserAuthID) is allowed to grant.
   * - If currentUserAuthID belongs to a sub-user (VendorAccess row exists), returns
   *   that sub-user's own orgIDs — so they can never grant access wider than their own.
   * - Otherwise (primary vendor admin), returns every org the vendor itself has approved.
   */
  private async getAssignableOrgIDs(
    vendorID: string,
    currentUserAuthID: string,
  ): Promise<string[]> {
    const callerAccess = await this.vendorAccessModel.findOne({
      where: { authID: currentUserAuthID, vendorID },
    });
    if (callerAccess) {
      return (callerAccess.orgIDs || []).map(String);
    }
    const approved = await this.vendorRequestModel.findAll({
      where: { vendorID, requestStatus: RequestStatus.Approved },
      attributes: ['orgID'],
    });
    return approved.map((r) => String(r.orgID));
  }

  private validateOrgIDsSubset(requested: string[], assignable: string[]) {
    const invalid = requested.filter((id) => !assignable.includes(String(id)));
    if (invalid.length) {
      throw new BadRequestException(
        `You cannot grant access to organization(s) you don't have access to yourself: ${invalid.join(
          ', ',
        )}`,
      );
    }
  }

  async addAccess(
    vendorID: string,
    vendorUserID: string,
    currentUserAuthID: string,
    dto: AddVendorAccessInput,
  ): Promise<VendorAccess> {
    const existingAccess = await this.vendorAccessModel.findOne({
      where: { email: dto.email },
    });
    if (existingAccess)
      throw new BadRequestException('This email is already added.');

    const assignable = await this.getAssignableOrgIDs(
      vendorID,
      currentUserAuthID,
    );
    this.validateOrgIDsSubset(dto.orgIDs, assignable);

    const transaction = await this.vendorAccessModel.sequelize.transaction();
    try {
      const authUser = await this.authService.create(
        {
          name: dto.name,
          email: dto.email,
          userType: UserType.Vendor,
          vendorID,
          vendorUserID,
          status: Status.Active,
          password: crypto.randomBytes(16).toString('hex'),
          passwordCreatedAt: new Date(),
        } as any,
        transaction,
      );

      const access = await this.vendorAccessModel.create(
        {
          name: dto.name,
          email: dto.email,
          vendorID,
          orgIDs: dto.orgIDs,
          authID: authUser.id,
        },
        { transaction },
      );

      await transaction.commit();

      await this.authService.generateResetPasswordLinkAndSendMail(
        authUser.id.toString(),
        { name: dto.name, email: dto.email },
        UserType.Vendor,
        'email-verification',
        dto.email,
        EndPoint.Vendor,
      );

      return access;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async listByVendor(vendorID: string, filter: any = {}) {
    const {
      take = 25,
      skip = 0,
      sortBy = 'id',
      sortOrder = 'DESC',
      search,
    } = filter;
    const whereClause: any = { vendorID };
    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }
    const result = await this.vendorAccessModel.findAndCountAll({
      where: whereClause,
      order: [[sortBy, sortOrder]],
      limit: take,
      offset: skip * take,
      distinct: true,
    });
    return { totalItems: result.count, items: result.rows };
  }

  async updateAccess(
    id: string,
    vendorID: string,
    currentUserAuthID: string,
    dto: UpdateVendorAccessInput,
  ): Promise<VendorAccess> {
    const access = await this.vendorAccessModel.findOne({
      where: { id, vendorID },
    });
    if (!access) throw new NotFoundException('Access not found');

    const newName = dto.name ?? access.name;
    const newEmail = dto.email ?? access.email;
    const newOrgIDs = dto.orgIDs ?? (access.orgIDs || []).map(String);

    const nameChanged = newName !== access.name;
    const emailChanged = newEmail !== access.email;
    const orgIDsChanged =
      JSON.stringify([...newOrgIDs].sort()) !==
      JSON.stringify([...(access.orgIDs || []).map(String)].sort());

    if (dto.orgIDs) {
      const assignable = await this.getAssignableOrgIDs(
        vendorID,
        currentUserAuthID,
      );
      this.validateOrgIDsSubset(dto.orgIDs, assignable);
    }

    // No actual changes — just resend the invite, skip DB writes entirely
    if (!nameChanged && !emailChanged && !orgIDsChanged) {
      const authUser = await this.authModel.findOne({
        where: { email: access.email, vendorID, userType: UserType.Vendor },
      });
      if (authUser) {
        await this.authService.generateResetPasswordLinkAndSendMail(
          authUser.id.toString(),
          { name: access.name, email: access.email },
          UserType.Vendor,
          'email-verification',
          access.email,
          EndPoint.Vendor,
        );
      }
      return access;
    }

    if (emailChanged) {
      const emailInUse = await this.authModel.findOne({
        where: { email: newEmail },
      });
      if (emailInUse) {
        throw new BadRequestException(
          'This email is already registered elsewhere in the system. Please use a different email address for this access.',
        );
      }
    }

    const transaction = await this.vendorAccessModel.sequelize.transaction();
    try {
      await this.vendorAccessModel.update(
        { name: newName, email: newEmail, orgIDs: newOrgIDs },
        { where: { id }, transaction },
      );

      if (emailChanged) {
        const [affectedRows] = await this.authModel.update(
          { email: newEmail },
          {
            where: { email: access.email, vendorID, userType: UserType.Vendor },
            transaction,
          },
        );
        if (affectedRows === 0) {
          throw new BadRequestException(
            'Could not find a matching login credential for this email.',
          );
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    if (emailChanged) {
      const changedAuthUser = await this.authModel.findOne({
        where: { email: newEmail },
      });
      if (changedAuthUser) {
        await this.sessionService.invalidate(changedAuthUser.id.toString());
      }
    }

    // Org access narrowed/changed — force re-login so their session's orgID
    // (if it's now outside their new orgIDs) gets re-validated on next switch/load.
    if (orgIDsChanged) {
      const authUser = await this.authModel.findOne({
        where: { email: newEmail, vendorID, userType: UserType.Vendor },
      });
      if (authUser) {
        await this.sessionService.invalidate(authUser.id.toString());
      }
    }

    return this.vendorAccessModel.findByPk(id);
  }

  async removeAccess(
    id: string,
    vendorID: string,
  ): Promise<{ message: string }> {
    const access = await this.vendorAccessModel.findOne({
      where: { id, vendorID },
    });
    if (!access) throw new NotFoundException('Access not found');

    const authUser = await this.authModel.findOne({
      where: { email: access.email, vendorID, userType: UserType.Vendor },
    });
    if (authUser) {
      await this.sessionService.invalidate(authUser.id.toString());
      await this.authModel.destroy({ where: { id: authUser.id } });
    }

    await this.vendorAccessModel.destroy({ where: { id }, force: true });
    return { message: 'Access removed successfully' };
  }

  async getById(
    id: string,
    vendorID: string,
  ): Promise<{ message: string; data: VendorAccess }> {
    const access = await this.vendorAccessModel.findOne({
      where: { id, vendorID },
    });
    if (!access) throw new NotFoundException('Access not found');
    return { message: 'Access found', data: access };
  }
}
