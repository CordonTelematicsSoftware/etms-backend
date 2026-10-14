import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { CordonGpsAuthService } from './cordon-gps-auth.service';
import { cordonGpsPointToGpsPoint } from '../utils/cordon-gps-point.mapper';
import {
  CordonBatchPullResponse,
  CordonPanicRecord,
  CordonPanicResponse,
  CordonPoint,
  CordonPullResponse,
  GpsPoint,
} from '../interfaces/cordon-gps.interfaces';

@Injectable()
export class CordonGpsApiService {
  private readonly logger = new Logger(CordonGpsApiService.name);
  private readonly baseUrl = this.configService.get('CORDON_GPS_BASE_URL');

  constructor(
    private configService: ConfigService,
    private cordonGpsAuthService: CordonGpsAuthService,
  ) {}

  async getLastLocationByRto(orgID: any, rto: string): Promise<GpsPoint[]> {
    const body = await this.executeRequest<CordonPullResponse>(orgID, (token) =>
      axios.get(`${this.baseUrl}/api/v1/api/pull`, {
        headers: { token },
        params: { rto },
        timeout: 10000,
      }),
    );

    return this.mapPoints(body.data);
  }

  async getTrailByRto(
    orgID: any,
    rto: string,
    from: string,
    to: string,
  ): Promise<GpsPoint[]> {
    const body = await this.executeRequest<CordonPullResponse>(orgID, (token) =>
      axios.get(`${this.baseUrl}/api/v1/api/pull`, {
        headers: { token },
        params: { rto, from, to },
        timeout: 10000,
      }),
    );

    // Cordon returns newest-first; FE trails are drawn oldest-first.
    return this.mapPoints(body.data).reverse();
  }

  async getLastLocationByImei(orgID: any, imei: string): Promise<GpsPoint[]> {
    const body = await this.executeRequest<CordonPullResponse>(
      orgID,
      (token) =>
        axios.get(`${this.baseUrl}/api/v1/api/pull`, {
          headers: { token },
          params: { imei },
          timeout: 10000,
        }),
      true, // per-trip pull: unprovisioned orgs fall back to the master token
    );

    return this.mapPoints(body.data);
  }

  async getTrailByImei(
    orgID: any,
    imei: string,
    from: string,
    to: string,
  ): Promise<GpsPoint[]> {
    const body = await this.executeRequest<CordonPullResponse>(
      orgID,
      (token) =>
        axios.get(`${this.baseUrl}/api/v1/api/pull`, {
          headers: { token },
          params: { imei, from, to },
          timeout: 10000,
        }),
      true, // per-trip pull: unprovisioned orgs fall back to the master token
    );

    // Cordon returns newest-first; FE trails are drawn oldest-first.
    return this.mapPoints(body.data).reverse();
  }

  async getPanicHistory(
    orgID: any,
    from: string,
    to: string,
    imei?: string,
  ): Promise<CordonPanicRecord[]> {
    const body = await this.executeRequest<CordonPanicResponse>(
      orgID,
      (token) =>
        axios.get(`${this.baseUrl}/api/v1/api/pull_panic_history`, {
          params: { from, to, token, ...(imei ? { imei } : {}) },
          timeout: 10000,
        }),
    );

    return body.data?.data ?? [];
  }

  // Static master-token batch call. Deliberately bypasses executeRequest,
  // which is hard-wired to the per-org getToken/invalidate login cache.
  async getLastLocationsByImeis(
    imeis: string[],
  ): Promise<CordonBatchPullResponse> {
    const token = await this.cordonGpsAuthService.getMasterToken();
    try {
      const response = await axios.post<CordonBatchPullResponse>(
        `${this.baseUrl}/api/v1/Api/pull_by_imei`,
        { imei: imeis },
        { headers: { token }, timeout: 10000 },
      );

      if (response.data?.status === false) {
        throw new HttpException(
          response.data?.message || 'Cordon GPS batch API returned an error',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return response.data;
    } catch (error) {
      this.logger.error(
        'Cordon GPS batch API request failed',
        error?.response?.data || error?.message || error,
      );
      throw error instanceof HttpException
        ? error
        : new HttpException(
            'Cordon GPS batch API request failed',
            HttpStatus.BAD_GATEWAY,
          );
    }
  }

  private mapPoints(points: CordonPoint[]): GpsPoint[] {
    return (points ?? [])
      .map(cordonGpsPointToGpsPoint)
      .filter((point): point is GpsPoint => point !== null);
  }

  private async executeRequest<
    T extends { status: boolean; token_expired?: boolean; message?: string },
  >(
    orgID: any,
    buildRequest: (token: string) => Promise<AxiosResponse<T>>,
    // Opt-in per call site. Only the per-trip pulls set this; panic history
    // must stay on per-org login (a master token there would leak every org's
    // panic events into one org's alert list, since the call has no IMEI filter).
    allowMasterFallback = false,
  ): Promise<T> {
    try {
      const { token, isMaster } = allowMasterFallback
        ? await this.cordonGpsAuthService.getPullToken(orgID)
        : {
            token: await this.cordonGpsAuthService.getToken(orgID),
            isMaster: false,
          };
      let response = await buildRequest(token);

      if (response.data?.token_expired === true) {
        // The master token is static config, not a session token - there is no
        // login to redo, so invalidate + retry would replay the same rejected
        // value and the invalidate() would evict an unrelated org's entry.
        if (isMaster) {
          throw new HttpException(
            'Cordon GPS master token was rejected as expired',
            HttpStatus.BAD_GATEWAY,
          );
        }

        this.cordonGpsAuthService.invalidate(orgID);
        const newToken = await this.cordonGpsAuthService.getToken(orgID);
        response = await buildRequest(newToken);

        if (response.data?.token_expired === true) {
          throw new HttpException(
            'Cordon GPS token expired twice in a row',
            HttpStatus.BAD_GATEWAY,
          );
        }
      }

      if (response.data?.status === false) {
        throw new HttpException(
          response.data?.message || 'Cordon GPS API returned an error',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return response.data;
    } catch (error) {
      this.logger.error(
        'Cordon GPS API request failed',
        error?.response?.data || error?.message || error,
      );
      throw error instanceof HttpException
        ? error
        : new HttpException(
            'Cordon GPS API request failed',
            HttpStatus.BAD_GATEWAY,
          );
    }
  }
}
