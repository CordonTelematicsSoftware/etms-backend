import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JsonWebTokenService } from '../../shared/utils/jwt';
import { SessionService } from '../../auth/services/session.service';

@WebSocketGateway({
  namespace: '/sos',
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://admin-uat.smartrouter.in',
      'https://vendor-uat.smartrouter.in',
      'https://employee-uat.smartrouter.in',
      'https://admin.smartrouter.in',
      'https://vendor.smartrouter.in',
    ],
    credentials: true,
  },
})
export class SosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SosGateway.name);

  constructor(
    private readonly jsonWebTokenService: JsonWebTokenService,
    private readonly sessionService: SessionService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.query?.token as string;

    this.logger.log(
      `[SOS] New connection attempt — socket: ${
        client.id
      }, hasToken: ${!!token}`,
    );

    if (!token) {
      this.logger.warn(`[SOS] Rejected socket ${client.id} — missing token`);
      client.disconnect();
      return;
    }

    // Verify the JWT signature/expiry — same as HTTP guards do
    try {
      await this.jsonWebTokenService.verifyToken(token);
    } catch (err) {
      this.logger.warn(
        `[SOS] Rejected socket ${client.id} — invalid or expired token`,
      );
      client.disconnect();
      return;
    }

    // Look up the session tied to this exact token. getSessionData()
    // already filters invalidated: false, so a null result here means
    // either there's no session for this token or it was invalidated
    // (logout, password reset, etc.) — both cases are rejected.
    const session = await this.sessionService.getSessionData(token);
    if (!session) {
      this.logger.warn(
        `[SOS] Rejected socket ${client.id} — no active session for token`,
      );
      client.disconnect();
      return;
    }

    // Derive orgID/vendorID from the verified session, NOT from client
    // query parameters. This is the fix: the client can no longer choose
    // which org/vendor room to join.
    const orgID = session.orgID;
    const vendorID = session.vendorID;

    if (!orgID && !vendorID) {
      this.logger.warn(
        `[SOS] Rejected socket ${client.id} — session has no org/vendor association`,
      );
      client.disconnect();
      return;
    }

    if (orgID) {
      const orgRoom = `sos-org-${orgID}`;
      await client.join(orgRoom);
      this.logger.log(`[SOS] Socket ${client.id} joined org room ${orgRoom}`);
    }

    if (vendorID) {
      const vendorRoom = `sos-vendor-${vendorID}`;
      await client.join(vendorRoom);
      this.logger.log(
        `[SOS] Socket ${client.id} joined vendor room ${vendorRoom}`,
      );
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[SOS] Socket ${client.id} disconnected`);
  }

  emitSosAlert(orgID: string, data: any) {
    const room = `sos-org-${orgID}`;
    this.logger.log(
      `[SOS] Emitting sos-alert to org room ${room} — data: ${JSON.stringify(
        data,
      )}`,
    );
    this.server.to(room).emit('sos-alert', data);
    this.logger.log(`[SOS] Emit complete for org room ${room}`);
  }

  emitSosAlertToVendor(vendorID: string, data: any) {
    const room = `sos-vendor-${vendorID}`;
    this.logger.log(
      `[SOS] Emitting sos-alert to vendor room ${room} — data: ${JSON.stringify(
        data,
      )}`,
    );
    this.server.to(room).emit('sos-alert', data);
    this.logger.log(`[SOS] Emit complete for vendor room ${room}`);
  }
}
