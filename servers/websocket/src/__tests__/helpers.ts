import { createServer, type Server as HttpServer } from 'node:http';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { NotFoundError } from '@arena/shared';
import type { MatchId, UserId } from '@arena/shared';
import { StateBroadcaster } from '@arena/game-server';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { vi } from 'vitest';
import { createWebsocketGateway } from '../gateway.js';
import type {
  ClientToServerEvents,
  JoinMatchAck,
  JoinMatchPayload,
  ServerToClientEvents,
  WebsocketGateway,
} from '../types.js';

export const TEST_JWT_SECRET = 'test-jwt-secret';

export class MockGatewayHost {
  readonly broadcaster: StateBroadcaster;
  readonly handleInput = vi.fn<(matchId: MatchId, userId: UserId, input: unknown) => void>();
  readonly handlePlayerLeave = vi.fn<(matchId: MatchId, userId: UserId) => void>();
  readonly getState = vi.fn((matchId: MatchId): unknown => {
    const state = this.states.get(matchId);
    if (state === undefined) {
      throw new NotFoundError('Match not found', { matchId });
    }

    return state;
  });

  private readonly states = new Map<MatchId, unknown>();

  constructor(broadcaster = new StateBroadcaster()) {
    this.broadcaster = broadcaster;
  }

  setState(matchId: MatchId, state: unknown): void {
    this.states.set(matchId, state);
  }
}

export interface TestGatewayContext {
  readonly broadcaster: StateBroadcaster;
  readonly gateway: WebsocketGateway;
  readonly host: MockGatewayHost;
  readonly httpServer: HttpServer;
  readonly port: number;
}

/**
 * Start a real in-process websocket gateway bound to an ephemeral port.
 *
 * @param options - Optional gateway configuration overrides
 * @returns The started test context
 */
export async function createTestGatewayContext(options?: {
  readonly reconnectGraceMs?: number;
}): Promise<TestGatewayContext> {
  const broadcaster = new StateBroadcaster();
  const host = new MockGatewayHost(broadcaster);
  const httpServer = createServer();
  const gateway = createWebsocketGateway({
    host,
    jwtSecret: TEST_JWT_SECRET,
    reconnectGraceMs: options?.reconnectGraceMs,
    httpServer,
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      resolve();
    });
  });

  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an ephemeral TCP port');
  }

  return {
    broadcaster,
    gateway,
    host,
    httpServer,
    port: address.port,
  };
}

/**
 * Create a signed test JWT for a user.
 *
 * @param userId - The authenticated user
 * @param options - Optional signing overrides
 * @returns A JWT string
 */
export function signTestToken(userId: UserId, options?: SignOptions): string {
  return jwt.sign({ userId }, TEST_JWT_SECRET, {
    expiresIn: '7d',
    ...options,
  });
}

/**
 * Connect a Socket.io client to the in-process test gateway.
 *
 * @param port - The gateway port
 * @param options - Handshake configuration
 * @returns A connected client socket
 */
export async function connectClient(
  port: number,
  options: {
    readonly token?: string;
    readonly queryToken?: string;
  },
): Promise<ClientSocket<ServerToClientEvents, ClientToServerEvents>> {
  return await new Promise((resolve, reject) => {
    const client = createClient(`http://127.0.0.1:${port}`, {
      auth: options.token ? { token: options.token } : {},
      query: options.queryToken ? { token: options.queryToken } : undefined,
      reconnection: false,
      transports: ['websocket'],
      forceNew: true,
    });

    const handleConnect = (): void => {
      cleanup();
      resolve(client);
    };

    const handleError = (error: Error): void => {
      cleanup();
      client.close();
      reject(error);
    };

    const cleanup = (): void => {
      client.off('connect', handleConnect);
      client.off('connect_error', handleError);
    };

    client.once('connect', handleConnect);
    client.once('connect_error', handleError);
  });
}

/**
 * Attempt a client connection and capture the connection error.
 *
 * @param port - The gateway port
 * @param options - Handshake configuration
 * @returns The connection error
 */
export async function connectExpectingError(
  port: number,
  options: {
    readonly token?: string;
    readonly queryToken?: string;
  },
): Promise<Error> {
  try {
    await connectClient(port, options);
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw error;
  }

  throw new Error('Expected connection to fail');
}

/**
 * Emit join-match and await its acknowledgement.
 *
 * @param client - The connected client
 * @param payload - The join payload
 * @returns The acknowledgement payload
 */
export async function emitJoinMatch(
  client: ClientSocket<ServerToClientEvents, ClientToServerEvents>,
  payload: JoinMatchPayload,
): Promise<JoinMatchAck> {
  return await new Promise((resolve) => {
    client.emit('join-match', payload, (response) => {
      resolve(response);
    });
  });
}

/**
 * Await exactly one socket event with a timeout.
 *
 * @param client - The connected client
 * @param event - The event name
 * @param timeoutMs - Timeout in milliseconds
 * @returns The event payload
 */
export async function waitForEvent<EventName extends keyof ServerToClientEvents>(
  client: ClientSocket<ServerToClientEvents, ClientToServerEvents>,
  event: EventName,
  timeoutMs = 1_000,
): Promise<Parameters<ServerToClientEvents[EventName]>[0]> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, handleEvent);
      reject(new Error(`Timed out waiting for ${String(event)}`));
    }, timeoutMs);

    const handleEvent = (payload: Parameters<ServerToClientEvents[EventName]>[0]): void => {
      clearTimeout(timer);
      resolve(payload);
    };

    client.once(event, handleEvent);
  });
}

/**
 * Assert that no event arrives within a window.
 *
 * @param client - The connected client
 * @param event - The event name
 * @param delayMs - Observation window
 */
export async function expectNoEvent<EventName extends keyof ServerToClientEvents>(
  client: ClientSocket<ServerToClientEvents, ClientToServerEvents>,
  event: EventName,
  delayMs = 150,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handleEvent = (): void => {
      clearTimeout(timer);
      reject(new Error(`Unexpected ${String(event)} event`));
    };

    const timer = setTimeout(() => {
      client.off(event, handleEvent);
      resolve();
    }, delayMs);

    client.once(event, handleEvent);
  });
}

/**
 * Seed the gateway's match-player registry through broadcaster events.
 *
 * @param context - The gateway test context
 * @param matchId - The match identifier
 * @param players - Players in the match
 * @param state - The current match state
 */
export function seedMatch(
  context: TestGatewayContext,
  matchId: MatchId,
  players: readonly UserId[],
  state: unknown,
): void {
  context.host.setState(matchId, state);

  for (const player of players) {
    context.broadcaster.emitPlayerJoined(matchId, player);
  }
}

/**
 * Pause for a short duration.
 *
 * @param ms - Delay duration
 */
export async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Close test clients, the gateway, and the HTTP server.
 *
 * @param context - The gateway test context
 * @param clients - Clients to close first
 */
export async function cleanupTestContext(
  context: TestGatewayContext,
  clients: readonly ClientSocket<ServerToClientEvents, ClientToServerEvents>[] = [],
): Promise<void> {
  for (const client of clients) {
    client.close();
  }

  await context.gateway.shutdown();
  await closeHttpServer(context.httpServer);
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
