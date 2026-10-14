import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CordonLoginResponse } from '../interfaces/cordon-gps.interfaces';
import { ConfigurationService } from 'src/config-management/config/services/config.service';

export interface CordonToken {
  token: string;
  // True when this is the static master token. Callers must not run it
  // through invalidate + re-login: there is no login exchange behind it.
  isMaster: boolean;
}

// Both keys must be org-overridden for the org to count as provisioned.
const CORDON_CREDENTIAL_KEYS = ['cordon_gps_Username', 'cordon_gps_password'];

@Injectable()
export class CordonGpsAuthService {
  private readonly logger = new Logger(CordonGpsAuthService.name);
  private tokens = new Map<string, string>();
  private loginPromises = new Map<string, Promise<string>>();

  constructor(
    private configService: ConfigService,
    private configurationService: ConfigurationService,
  ) {}

  async getToken(orgID: any): Promise<string> {
    const key = String(orgID);
    const cached = this.tokens.get(key);
    if (cached) {
      return cached;
    }

    let loginPromise = this.loginPromises.get(key);
    if (!loginPromise) {
      loginPromise = this.login(orgID).finally(() => {
        this.loginPromises.delete(key);
      });
      this.loginPromises.set(key, loginPromise);
    }

    return loginPromise;
  }

  invalidate(orgID: any): void {
    this.tokens.delete(String(orgID));
  }

  // Static, org-independent token used by batch endpoints that authenticate
  // with a single master credential instead of the per-org login flow above.
  // Deliberately does not touch tokens/loginPromises/getToken/login.
  async getMasterToken(): Promise<string> {
    const token = await this.configurationService.getConfigValue(
      'cordon_gps_master_token',
    );
    if (!token) {
      throw new HttpException(
        'Cordon GPS master token is not configured.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return token;
  }

  // "Provisioned" = this org holds its own override row for BOTH credential
  // keys. Deliberately not a value comparison against the placeholder literals
  // ("username"/"password"): those strings are undocumented, unverified, and
  // would silently stop matching the day someone edits the seed row. Override
  // existence is the same question, answered by the schema instead of a guess.
  private async isOrgProvisioned(orgID: any): Promise<boolean> {
    if (!orgID) {
      return false;
    }

    return await this.configurationService.hasOrgConfigOverrides(
      CORDON_CREDENTIAL_KEYS,
      orgID,
    );
  }

  // Token resolution for the per-trip pull endpoints ONLY.
  // An unprovisioned org would otherwise attempt a login with the global
  // placeholder credentials, which the vendor rejects with a 502 on every
  // request (failures are never cached, so it re-attempts each time).
  // Not used by getPanicHistory: panic history is unfiltered by IMEI, so a
  // master token there would show one org every org's panic events.
  async getPullToken(orgID: any): Promise<CordonToken> {
    if (await this.isOrgProvisioned(orgID)) {
      return { token: await this.getToken(orgID), isMaster: false };
    }

    // Returned directly and never written to this.tokens. Entries in that map
    // are assumed re-loginable by invalidate() and the token_expired retry;
    // the master token is static config and satisfies neither assumption.
    return { token: await this.getMasterToken(), isMaster: true };
  }

  // Each org has its own Cordon account, so credentials come from the
  // per-org config override rather than env vars. getConfigValue throws if
  // the master key hasn't been created at all, and returns null if it
  // exists but this org has no override and no default - both mean the
  // same thing here: this org isn't set up yet.
  private async getCredentials(
    orgID: any,
  ): Promise<{ username: string; password: string }> {
    let username: string;
    let password: string;
    try {
      [username, password] = await Promise.all([
        this.configurationService.getConfigValue('cordon_gps_Username', orgID),
        this.configurationService.getConfigValue('cordon_gps_password', orgID),
      ]);
    } catch {
      throw new HttpException(
        'Cordon GPS credentials are not configured for this organization.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!username || !password) {
      throw new HttpException(
        'Cordon GPS credentials are not configured for this organization.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return { username, password };
  }

  async login(orgID: any): Promise<string> {
    const baseUrl = this.configService.get('CORDON_GPS_BASE_URL');
    const { username, password } = await this.getCredentials(orgID);

    try {
      const response = await axios.post<CordonLoginResponse>(
        `${baseUrl}/api/v1/auth/login`,
        { username, password },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );

      if (!response.data?.status || !response.data?.token) {
        throw new HttpException(
          'Cordon GPS login did not return a token',
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.tokens.set(String(orgID), response.data.token);
      return response.data.token;
    } catch (error) {
      this.logger.error(
        'Cordon GPS login failed',
        error?.response?.data || error?.message || error,
      );
      throw error instanceof HttpException
        ? error
        : new HttpException('Cordon GPS login failed', HttpStatus.BAD_GATEWAY);
    }
  }
}
