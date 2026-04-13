import { createServer } from 'node:http';
import type { MatchId, UserId } from '@arena/shared';
import { Server } from 'socket.io';
import { createAuthenticateHandler } from './handlers/authenticate.js';
import { createDisconnectHandler } from './handlers/disconnect.js';
import { createJoinMatchHandler } from './handlers/join-match.js';
import { createPlayerInputHandler } from './handlers/player-input.js';
import { getMatchRoom, getPendingLeaveKey } from './lib/gateway-keys.js';
import type {
  ClientToServerEvents,
  CreateWebsocketGatewayDependencies,
  GatewaySocketData,
  ServerToClientEvents,
  WebsocketGateway,
} from './types.js';

interface PendingLeaveEntry {
  readonly matchId: MatchId;
  readonly userId: UserId;
  readonly timer: NodeJS.Timeout;
}

const DEFAULT_RECONNECT_GRACE_MS = 30_000;

/**
 * Create the Arena websocket gateway around a GameInstanceHost-compatible host.
 *
 * @param dependencies - Host, auth, and server dependencies
 * @returns A configured Socket.io server with a shutdown helper
 */
export function createWebsocketGateway(
  dependencies: CreateWebsocketGatewayDependencies,
): WebsocketGateway {
  if (!dependencies.jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  const reconnectGraceMs = dependencies.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS;
  if (reconnectGraceMs < 0) {
    throw new Error('RECONNECT_GRACE_MS must be non-negative');
  }

  const httpServer = dependencies.httpServer ?? createServer();
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    GatewaySocketData
  >(httpServer, {
    cors: {
      origin: dependencies.corsOrigin ?? '*',
    },
  });

  const knownMatchPlayers = new Map<MatchId, Set<UserId>>();
  const activeSocketsByMatch = new Map<MatchId, Map<UserId, Set<string>>>();
  const pendingLeaves = new Map<string, PendingLeaveEntry>();
  let isShuttingDown = false;

  const unsubscribeState = dependencies.host.broadcaster.onState((matchId, state) => {
    io.to(getMatchRoom(matchId)).emit('state', state);
  });

  const unsubscribeMatchEnd = dependencies.host.broadcaster.onMatchEnd((matchId, result) => {
    cleanupRoomMemberships(matchId);
    cancelPendingLeavesForMatch(matchId);
    knownMatchPlayers.delete(matchId);
    activeSocketsByMatch.delete(matchId);

    const roomName = getMatchRoom(matchId);
    io.to(roomName).emit('match-end', result);
    io.in(roomName).socketsLeave(roomName);
  });

  const unsubscribePlayerJoined = dependencies.host.broadcaster.onPlayerJoined((matchId, userId) => {
    getOrCreatePlayerSet(matchId).add(userId);
    io.to(getMatchRoom(matchId)).emit('player-joined', { userId });
  });

  const unsubscribePlayerLeft = dependencies.host.broadcaster.onPlayerLeft((matchId, userId) => {
    const players = knownMatchPlayers.get(matchId);
    players?.delete(userId);

    const socketsByUser = activeSocketsByMatch.get(matchId);
    socketsByUser?.delete(userId);
    if (socketsByUser && socketsByUser.size === 0) {
      activeSocketsByMatch.delete(matchId);
    }

    io.to(getMatchRoom(matchId)).emit('player-left', { userId });
  });

  io.use(createAuthenticateHandler({ jwtSecret: dependencies.jwtSecret }));

  io.on('connection', (socket) => {
    socket.on(
      'join-match',
      createJoinMatchHandler(
        {
          host: dependencies.host,
          knownMatchPlayers,
          addActiveSocket,
          clearPendingLeave,
        },
        socket,
      ),
    );

    socket.on(
      'player-input',
      createPlayerInputHandler(
        {
          host: dependencies.host,
        },
        socket,
      ),
    );

    socket.on(
      'disconnect',
      createDisconnectHandler(
        {
          reconnectGraceMs,
          removeActiveSocket,
          schedulePendingLeave: (matchId) => {
            schedulePendingLeave(matchId, socket.data.userId);
          },
        },
        socket,
      ),
    );
  });

  async function shutdown(): Promise<void> {
    isShuttingDown = true;

    unsubscribeState();
    unsubscribeMatchEnd();
    unsubscribePlayerJoined();
    unsubscribePlayerLeft();

    for (const { timer } of pendingLeaves.values()) {
      clearTimeout(timer);
    }

    pendingLeaves.clear();
    activeSocketsByMatch.clear();
    knownMatchPlayers.clear();

    await new Promise<void>((resolve) => {
      io.close(() => {
        resolve();
      });
    });
  }

  const gateway = io as WebsocketGateway;
  gateway.shutdown = shutdown;
  return gateway;

  function cleanupRoomMemberships(matchId: MatchId): void {
    const roomName = getMatchRoom(matchId);
    const socketIds = io.sockets.adapter.rooms.get(roomName);

    if (!socketIds) {
      return;
    }

    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      socket?.data.joinedMatchIds.delete(matchId);
    }
  }

  function getOrCreatePlayerSet(matchId: MatchId): Set<UserId> {
    const existing = knownMatchPlayers.get(matchId);
    if (existing) {
      return existing;
    }

    const created = new Set<UserId>();
    knownMatchPlayers.set(matchId, created);
    return created;
  }

  function addActiveSocket(matchId: MatchId, userId: UserId, socketId: string): void {
    const socketsByUser = activeSocketsByMatch.get(matchId) ?? new Map<UserId, Set<string>>();
    const socketIds = socketsByUser.get(userId) ?? new Set<string>();

    socketIds.add(socketId);
    socketsByUser.set(userId, socketIds);
    activeSocketsByMatch.set(matchId, socketsByUser);
  }

  function removeActiveSocket(matchId: MatchId, socketId: string): number {
    const socketsByUser = activeSocketsByMatch.get(matchId);
    if (!socketsByUser) {
      return 0;
    }

    for (const [userId, socketIds] of socketsByUser) {
      if (!socketIds.delete(socketId)) {
        continue;
      }

      if (socketIds.size === 0) {
        socketsByUser.delete(userId);
      }

      if (socketsByUser.size === 0) {
        activeSocketsByMatch.delete(matchId);
      }

      return socketIds.size;
    }

    return 0;
  }

  function clearPendingLeave(matchId: MatchId, userId: UserId): void {
    const key = getPendingLeaveKey(matchId, userId);
    const entry = pendingLeaves.get(key);
    if (!entry) {
      return;
    }

    clearTimeout(entry.timer);
    pendingLeaves.delete(key);
  }

  function schedulePendingLeave(matchId: MatchId, userId: UserId): void {
    if (isShuttingDown) {
      return;
    }

    const key = getPendingLeaveKey(matchId, userId);
    if (pendingLeaves.has(key)) {
      return;
    }

    const timer = setTimeout(() => {
      pendingLeaves.delete(key);

      try {
        dependencies.host.handlePlayerLeave(matchId, userId);
      } catch (error) {
        console.error(JSON.stringify({
          action: 'gateway.pending_leave',
          userId,
          matchId,
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    }, reconnectGraceMs);

    pendingLeaves.set(key, { matchId, userId, timer });
  }

  function cancelPendingLeavesForMatch(matchId: MatchId): void {
    for (const [key, entry] of pendingLeaves) {
      if (entry.matchId !== matchId) {
        continue;
      }

      clearTimeout(entry.timer);
      pendingLeaves.delete(key);
    }
  }
}
