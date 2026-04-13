import type { MatchId, UserId } from '@arena/shared';

/**
 * Build the Socket.io room name for a match.
 *
 * @param matchId - The match identifier
 * @returns The Socket.io room name
 */
export function getMatchRoom(matchId: MatchId): string {
  return `match:${matchId}`;
}

/**
 * Build the reconnect-grace key for a player in a match.
 *
 * @param matchId - The match identifier
 * @param userId - The player identifier
 * @returns A stable reconnect-grace key
 */
export function getPendingLeaveKey(matchId: MatchId, userId: UserId): string {
  return `${matchId}:${userId}`;
}
