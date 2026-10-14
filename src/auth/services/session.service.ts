import { InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { JsonWebTokenService } from '../../shared/utils/jwt';
import { Session } from 'src/auth/models/session.model';

export class SessionService {
  private logger = new Logger(SessionService.name);
  constructor(
    @InjectModel(Session)
    private sessionModel: typeof Session,
    private jsonWebTokenService: JsonWebTokenService,
    private configService: ConfigService, // private readonly sequelize: Sequelize,
  ) {}

  async findOne(whereClause: any): Promise<Session> {
    try {
      const session = await this.sessionModel.findOne({
        where: whereClause,
      });
      return session;
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.sessionModel.destroy({ where: { id: id }, force: true });
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async invalidate(userID: string, userType?: string): Promise<boolean> {
    try {
      const whereClause: any = {};
      if (userType === 'Driver') {
        whereClause.driverID = userID;
      } else {
        whereClause.userID = userID;
      }
      await this.sessionModel.update(
        { invalidated: true },
        { where: whereClause, logging: true },
      );
      return true;
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  async updateToken(
    token: string,
    id: string,
    userType: string,
  ): Promise<string> {
    try {
      // Scoped to the live row on purpose: `token` carries no unique
      // constraint, and `create()` invalidates before inserting, so an
      // invalidated row can hold the same token string as a live one.
      const session = await this.sessionModel.findOne({
        where: { token, invalidated: false },
        attributes: ['id'],
      });
      if (!session) {
        this.logger.warn(
          'No live session row for presented token; not rotating',
        );
        return token;
      }

      const newToken = await this.jsonWebTokenService.generateToken(
        { id, userType },
        this.jsonWebTokenService.getSessionExpiryInSeconds(),
      );

      // Compare-and-swap: the `token` predicate is what makes this atomic.
      const [affectedCount] = await this.sessionModel.update(
        { token: newToken },
        { where: { id: session.id, token, invalidated: false } },
      );
      if (affectedCount === 0) {
        // Another concurrent request already rotated this session. Discard the
        // token we just minted and hand back the one actually stored, so the
        // client ends up holding a token the JWT strategy can resolve. Scoped
        // to invalidated:false so we never hand back a token from a row that
        // was invalidated between the swap and this read.
        const current = await this.sessionModel.findOne({
          where: { id: session.id, invalidated: false },
          attributes: ['token'],
        });
        this.logger.warn(
          `Token rotation race on session ${session.id}; returning stored token`,
        );
        return current?.token ?? token;
      }
      return newToken;
    } catch (error) {
      // Rotation is best-effort. The request has already authenticated with the
      // incoming token, so a failure here must not turn a healthy request into
      // a 500 — leave the client on the token it already holds.
      this.logger.error(
        `Token rotation failed; keeping the presented token: ${error?.message}`,
      );
      return token;
    }
  }

  async create(createSessionInput: any): Promise<Session> {
    try {
      const userId =
        createSessionInput.userType === 'Driver'
          ? createSessionInput.driverID
          : createSessionInput.userID;
      await this.invalidate(userId, createSessionInput.userType);
      return await this.sessionModel.create(createSessionInput);
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async update(whereClause: any, updateSessionInput: any): Promise<Session> {
    try {
      const session = await this.sessionModel.update(updateSessionInput, {
        where: whereClause,
        returning: true,
      });
      return session?.[1]?.[0];
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async getSessionData(token: string): Promise<Session> {
    try {
      const sessionData = await this.sessionModel.findOne({
        where: { token, invalidated: false },
        attributes: [
          'id',
          'userID',
          'invalidated',
          'employeeID',
          'userType',
          'permissions',
          'orgID',
          'name',
          'vendorUserID',
          'vendorID',
          'roleID',
          'driverID',
        ],
        subQuery: false,
      });
      return sessionData;
    } catch (error) {
      if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
