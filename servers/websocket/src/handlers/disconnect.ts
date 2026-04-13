import type { MatchId } from '@arena/shared';
import type { GatewaySocket } from '../types.js';

export interface CreateDisconnectHandlerDependencies {
  readonly reconnectGraceMs: number;
  readonly removeActiveSocket: (matchId: MatchId, socketId: string) => number;
  readonly schedulePendingLeave: (matchId: MatchId) => void;
}

/**
 * Create the disconnect handler that starts the reconnect grace timer.
 *
 * @param dependencies - Handler dependencies
 * @param socket - The authenticated socket
 * @returns A disconnect handler
 */
export function createDisconnectHandler(
  dependencies: CreateDisconnectHandlerDependencies,
  socket: GatewaySocket,
): () => void {
  return () => {
    for (const matchId of socket.data.joinedMatchIds) {
      const remainingSockets = dependencies.removeActiveSocket(matchId, socket.id);

      if (remainingSockets === 0) {
        dependencies.schedulePendingLeave(matchId);
      }
    }

    socket.data.joinedMatchIds.clear();
  };
}
