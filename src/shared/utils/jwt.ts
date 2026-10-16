import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayloadInterface } from '../../auth/interfaces/jwt-payload';
import { ConfigService } from '@nestjs/config';

// const DEFAULT_SESSION_EXPIRY_IN_SECONDS = 2592000; // 30 days (1 month)
const DEFAULT_SESSION_EXPIRY_IN_SECONDS =1800; 

@Injectable()
export class JsonWebTokenService {
  private logger = new Logger(JwtService.name);
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async generateToken(
    payload?: JwtPayloadInterface,
    expiresIn?: number | string,
  ): Promise<string> {
    const config = {
      secret: this.configService.get('JWT_SECRET'),
    };
    Object.assign(config, { expiresIn: this.resolveExpiresIn(expiresIn) });

    return this.jwtService.signAsync(payload ?? {}, config);
  }

  /**
   * Single source of truth for the session TTL.
   * Never returns NaN, undefined, or a non-positive value.
   */
  getSessionExpiryInSeconds(): number {
    const configured = Number(this.configService.get('JWT_EXPIRY_IN_SECONDS'));
    if (!Number.isFinite(configured) || configured <= 0) {
      this.logger.warn(
       'JWT_EXPIRY_IN_SECONDS absent or non-numeric; using default 500s (8 minutes and 20 seconds)', 
      );
      return DEFAULT_SESSION_EXPIRY_IN_SECONDS;
    }
    return configured;
  }

  private resolveExpiresIn(expiresIn?: number | string): number | string {
    if (typeof expiresIn === 'string' && expiresIn.trim() !== '') {
      return expiresIn;
    }
    if (
      typeof expiresIn === 'number' &&
      Number.isFinite(expiresIn) &&
      expiresIn > 0
    ) {
      return expiresIn;
    }
    this.logger.warn(
      'generateToken called without a usable expiresIn; falling back to session TTL',
    );
    return this.getSessionExpiryInSeconds();
  }

  async verifyToken(token: string): Promise<{
    exp: number;
    iat: number;
    id?: string;
    userType?: string;
    email?: string;
  }> {
    try {
      const config = {
        secret: this.configService.get('JWT_SECRET'),
      };

      return await this.jwtService.verify(token, config);
    } catch (error) {
      if (error?.message === 'jwt expired') {
        throw new BadRequestException('Token Expired');
      } else if (error.status !== 500) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }
}
