/**
 * Matchmaking service contract — manages queues, ELO ratings,
 * match creation, and match resolution.
 */

import type { UserId } from '../types/user.js';
import type { Money } from '../types/wallet.js';
import type { Match, MatchId, MatchResult } from '../types/match.js';
import type { GameId } from '../types/game.js';

/** A player's ELO rating for a specific game. */
export interface PlayerRating {
  /** The player. */
  readonly userId: UserId;
  /** The game this rating is for. */
  readonly gameId: GameId;
  /** Current ELO rating (starts at 1200). */
  readonly elo: number;
}

/**
 * Contract for the matchmaking service. Handles queue management,
 * skill-based pairing, and match lifecycle.
 */
export interface MatchmakingService {
  /**
   * Add a player to the matchmaking queue for a game and entry fee tier.
   * @param userId - The player joining the queue
   * @param gameId - The game to queue for
   * @param entryFeeCents - The entry fee tier in USD cents
   */
  joinQueue(
    userId: UserId,
    gameId: GameId,
    entryFeeCents: Money,
  ): Promise<void>;

  /**
   * Remove a player from the matchmaking queue.
   * @param userId - The player leaving the queue
   * @param gameId - The game queue to leave
   */
  leaveQueue(userId: UserId, gameId: GameId): Promise<void>;

  /**
   * Create a match from a set of matched players. Deducts entry fees
   * from all players via the wallet service.
   * @param gameId - The game being played
   * @param playerIds - The matched players
   * @param entryFeeCents - Entry fee per player in USD cents
   * @returns The created match
   */
  createMatch(
    gameId: GameId,
    playerIds: readonly UserId[],
    entryFeeCents: Money,
  ): Promise<Match>;

  /**
   * Resolve a completed match. Calculates payouts based on the game's
   * money model, awards prizes via the wallet service, and updates ELO ratings.
   * @param matchId - The match to resolve
   * @param result - Ordered placements from the game server
   * @returns The updated match with final results
   */
  resolveMatch(matchId: MatchId, result: MatchResult): Promise<Match>;

  /**
   * Get a player's current ELO rating for a game.
   * @param userId - The player to look up
   * @param gameId - The game to check
   * @returns The player's rating (defaults to 1200 if unrated)
   */
  getRating(userId: UserId, gameId: GameId): Promise<PlayerRating>;
}
