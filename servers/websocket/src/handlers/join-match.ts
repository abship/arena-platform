import type { MatchId, UserId } from '@arena/shared';
import { NotFoundError, ValidationError } from '@arena/shared';
import { getMatchRoom } from '../lib/gateway-keys.js';
import { toGatewayActionFailure, toGatewayErrorPayload } from '../lib/error-payload.js';
import type {
  GatewayHost,
  GatewaySocket,
  JoinMatchAckCallback,
  JoinMatchPayload,
} from '../types.js';

export interface CreateJoinMatchHandlerDependencies {
  readonly host: GatewayHost;
  readonly knownMatchPlayers: ReadonlyMap<MatchId, ReadonlySet<UserId>>;
  readonly addActiveSocket: (matchId: MatchId, userId: UserId, socketId: string) => void;
  readonly clearPendingLeave: (matchId: MatchId, userId: UserId) => void;
}

/**
 * Create the join-match event handler.
 *
 * @param dependencies - Handler dependencies
 * @param socket - The authenticated socket
 * @returns A join-match handler
 */
export function createJoinMatchHandler(
  dependencies: CreateJoinMatchHandlerDependencies,
  socket: GatewaySocket,
): (payload: JoinMatchPayload, ack?: JoinMatchAckCallback) => Promise<void> {
  return async (payload, ack) => {
    try {
      const matchId = parseMatchId(payload);
      const userId = socket.data.userId;
      const players = dependencies.knownMatchPlayers.get(matchId);

      if (!players) {
        throw new NotFoundError('Match not found or not yet created', { matchId });
      }

      if (!players.has(userId)) {
        throw new ValidationError('User is not a player in this match', {
          matchId,
          userId,
        });
      }

      const state = dependencies.host.getState(matchId);

      await socket.join(getMatchRoom(matchId));

      socket.data.joinedMatchIds.add(matchId);
      dependencies.addActiveSocket(matchId, userId, socket.id);
      dependencies.clearPendingLeave(matchId, userId);

      ack?.({
        ok: true,
        state,
      });
    } catch (error) {
      if (ack) {
        ack(toGatewayActionFailure(error));
        return;
      }

      socket.emit('gateway-error', toGatewayErrorPayload(error));
    }
  };
}

function parseMatchId(payload: JoinMatchPayload): MatchId {
  if (typeof payload.matchId !== 'string' || payload.matchId.trim().length === 0) {
    throw new ValidationError('matchId is required', {
      matchId: payload.matchId,
    });
  }

  return payload.matchId as MatchId;
}
