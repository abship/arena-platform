/**
 * Game server interface hierarchy. Base GameServer plus four extending
 * interfaces — one per engine class.
 */

import type { UserId } from '../types/user.js';
import type { MatchId } from '../types/match.js';

/**
 * Base game server interface. All game servers (regardless of engine class)
 * implement these core lifecycle methods.
 */
export interface GameServer {
  /**
   * Called when a player joins the game instance.
   * @param matchId - The match this instance belongs to
   * @param userId - The player joining
   */
  onPlayerJoin(matchId: MatchId, userId: UserId): void;

  /**
   * Called when a player sends input (movement, action, etc.).
   * @param matchId - The match this input is for
   * @param userId - The player who sent the input
   * @param input - The raw input data
   */
  onPlayerInput(matchId: MatchId, userId: UserId, input: unknown): void;

  /**
   * Called on each server tick (for real-time games) or periodically for housekeeping.
   * @param matchId - The match to tick
   * @param deltaMs - Milliseconds since the last tick
   */
  onTick(matchId: MatchId, deltaMs: number): void;

  /**
   * Called when a player leaves or disconnects.
   * @param matchId - The match the player left
   * @param userId - The player who left
   */
  onPlayerLeave(matchId: MatchId, userId: UserId): void;

  /**
   * Get the current serializable game state for a match.
   * @param matchId - The match to get state for
   * @returns The current game state
   */
  getState(matchId: MatchId): unknown;

  /**
   * Check whether the match has a winner or is over.
   * @param matchId - The match to check
   * @returns True if the match has ended
   */
  checkWinCondition(matchId: MatchId): boolean;
}

/**
 * Engine Class A — Real-Time Continuous.
 * Tick-based loop at 20-60hz with spatial partitioning and state broadcasting.
 */
export interface RealTimeGameServer extends GameServer {
  /** Server tick rate in hertz (e.g. 20, 30, 60). */
  readonly tickRate: number;

  /**
   * Get the spatial hash grid for efficient collision detection.
   * @param matchId - The match to get the grid for
   * @returns The spatial partitioning data structure
   */
  spatialGrid(matchId: MatchId): unknown;

  /**
   * Broadcast the latest game state to all connected players,
   * using delta compression to minimize bandwidth.
   * @param matchId - The match to broadcast state for
   */
  broadcastState(matchId: MatchId): void;
}

/**
 * Engine Class B — Turn-Based / Event-Driven.
 * No game loop. Server processes actions as they arrive.
 */
export interface TurnBasedGameServer extends GameServer {
  /**
   * Process a player's action (e.g. play a card, place a bet).
   * @param matchId - The match the action is for
   * @param userId - The player taking the action
   * @param action - The action data
   */
  processAction(matchId: MatchId, userId: UserId, action: unknown): void;

  /**
   * Validate whether an action is legal in the current game state.
   * @param matchId - The match to validate against
   * @param userId - The player attempting the action
   * @param action - The action to validate
   * @returns True if the action is valid
   */
  validateAction(matchId: MatchId, userId: UserId, action: unknown): boolean;

  /**
   * Advance to the next player's turn.
   * @param matchId - The match to advance
   */
  nextTurn(matchId: MatchId): void;
}

/**
 * Engine Class C — Algorithm / Click-and-Resolve.
 * Provably fair RNG outcomes with hash-committed seeds.
 */
export interface AlgorithmGameServer extends GameServer {
  /**
   * Generate the outcome for a round using provably fair RNG.
   * @param matchId - The match to generate an outcome for
   * @param playerSeed - The player's contributed seed value
   * @returns The generated outcome data
   */
  generateOutcome(matchId: MatchId, playerSeed: string): unknown;

  /**
   * Commit to a server seed by publishing its hash before the round.
   * @param matchId - The match to commit a seed for
   * @returns The hash of the committed seed
   */
  commitSeed(matchId: MatchId): string;

  /**
   * Reveal the server seed after a round for player verification.
   * @param matchId - The match to reveal the seed for
   * @returns The original server seed
   */
  revealSeed(matchId: MatchId): string;
}

/**
 * Engine Class D — Synchronized Parallel Competition.
 * Both players get identical inputs and play independently.
 */
export interface ParallelGameServer extends GameServer {
  /**
   * Generate the identical challenge/input that both players will receive.
   * @param matchId - The match to generate a challenge for
   * @returns The challenge data (e.g. piece sequence, math problems, text passage)
   */
  generateChallenge(matchId: MatchId): unknown;

  /**
   * Track a player's progress during the challenge.
   * @param matchId - The match being tracked
   * @param userId - The player whose progress to update
   * @param progress - Progress data (e.g. score, lines cleared, answers correct)
   */
  trackProgress(matchId: MatchId, userId: UserId, progress: unknown): void;

  /**
   * Compare results between all players and determine the winner.
   * @param matchId - The match to compare results for
   * @returns Ordered array of user IDs from best to worst performance
   */
  compareResults(matchId: MatchId): readonly UserId[];
}
