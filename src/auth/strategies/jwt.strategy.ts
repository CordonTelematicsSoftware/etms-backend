/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayloadInterface } from '../interfaces/jwt-payload';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SessionService } from '../services/session.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private logger = new Logger(JwtStrategy.name);
  constructor(
    private config: ConfigService,
    private sessionService: SessionService,
  ) {
    super({
      secretOrKey: config.get('JWT_SECRET'),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayloadInterface): Promise<any> {
    const { userType } = payload;
    // Access route information
    const fullUrl = req.originalUrl; // The full URL of the request
    const baseUrl = req.baseUrl; // The base URL of the route
    const path = req.path; // The specific path of the route
    const method = req.method; // The HTTP method (GET, POST, etc.)
    const params = req.params; // This will give you an object with path parameters
    // const userId = params.id; // For example, if your route is /users/:id

    this.logger.log(fullUrl, baseUrl, path, method, JSON.stringify(params));

    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    // console.log('Token:>>>>', token);

    const session = await this.sessionService.getSessionData(token);
    if (session) {
      // this.logger.log('Session found', JSON.stringify(session));
      return {
        id: session.userID,
        invalidated: session?.invalidated,
        employeeID: session?.employeeID,
        vendorUserID: session?.vendorUserID,
        vendorID: session?.vendorID,
        userType: session.userType,
        permissions: session.permissions,
        orgID: session?.orgID,
        name: session?.name,
        roleID: session?.roleID,
        driverID: session?.driverID,
      };
    } else {
      throw new UnauthorizedException();
    }
  }
}
