import type { Server as HttpServer } from 'node:http';
import type { GameInstanceHost } from '@arena/game-server';
import type { MatchId, MatchResult, UserId } from '@arena/shared';
import type { Server, Socket } from 'socket.io';

export interface JoinMatchPayload {
  readonly matchId: string;
}

export interface PlayerInputPayload {
  readonly matchId: string;
  readonly input: unknown;
}

export interface PlayerPresencePayload {
  readonly userId: UserId;
}

export interface GatewayErrorPayload {
  readonly error: string;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

export interface GatewayActionFailure extends GatewayErrorPayload {
  readonly ok: false;
}

export interface JoinMatchSuccess {
  readonly ok: true;
  readonly state: unknown;
}

export type JoinMatchAck = JoinMatchSuccess | GatewayActionFailure;

export type JoinMatchAckCallback = (response: JoinMatchAck) => void;

export interface ClientToServerEvents {
  'join-match': (payload: JoinMatchPayload, ack?: JoinMatchAckCallback) => void;
  'player-input': (payload: PlayerInputPayload) => void;
}

export interface ServerToClientEvents {
  state: (state: unknown) => void;
  'match-end': (result: MatchResult) => void;
  'player-joined': (payload: PlayerPresencePayload) => void;
  'player-left': (payload: PlayerPresencePayload) => void;
  'gateway-error': (payload: GatewayErrorPayload) => void;
}

export interface GatewaySocketData {
  userId: UserId;
  joinedMatchIds: Set<MatchId>;
}

export type GatewaySocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  GatewaySocketData
>;

export type GatewayHost = Pick<
  GameInstanceHost,
  'broadcaster' | 'handleInput' | 'handlePlayerLeave' | 'getState'
>;

export interface CreateWebsocketGatewayDependencies {
  readonly host: GatewayHost;
  readonly jwtSecret: string;
  readonly reconnectGraceMs?: number;
  readonly httpServer?: HttpServer;
  readonly corsOrigin?: string;
}

export type WebsocketGateway = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  GatewaySocketData
> & {
  shutdown(): Promise<void>;
};
