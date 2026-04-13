import type { MatchId } from '@arena/shared';
import { ValidationError } from '@arena/shared';
import { toGatewayErrorPayload } from '../lib/error-payload.js';
import { getMatchRoom } from '../lib/gateway-keys.js';
import type { GatewayHost, GatewaySocket, PlayerInputPayload } from '../types.js';

export interface CreatePlayerInputHandlerDependencies {
  readonly host: GatewayHost;
}

/**
 * Create the player-input event handler.
 *
 * @param dependencies - Handler dependencies
 * @param socket - The authenticated socket
 * @returns A player-input handler
 */
export function createPlayerInputHandler(
  dependencies: CreatePlayerInputHandlerDependencies,
  socket: GatewaySocket,
): (payload: PlayerInputPayload) => void {
  return (payload) => {
    try {
      const matchId = parseMatchId(payload);
      const roomName = getMatchRoom(matchId);

      if (!socket.rooms.has(roomName)) {
        throw new ValidationError('Socket has not joined this match', {
          matchId,
          userId: socket.data.userId,
        });
      }

      dependencies.host.handleInput(matchId, socket.data.userId, payload.input);
    } catch (error) {
      socket.emit('gateway-error', toGatewayErrorPayload(error));
    }
  };
}

function parseMatchId(payload: PlayerInputPayload): MatchId {
  if (typeof payload.matchId !== 'string' || payload.matchId.trim().length === 0) {
    throw new ValidationError('matchId is required', {
      matchId: payload.matchId,
    });
  }

  return payload.matchId as MatchId;
}
