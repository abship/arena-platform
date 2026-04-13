/**
 * Central host for managing game instances across all engine types.
 *
 * The host is the single entry point that servers/websocket will use:
 * 1. Subscribe to host.broadcaster events
 * 2. Call host.handleInput when a player sends input via socket
 * 3. Call host.handlePlayerLeave on disconnect
 */

import type { GameId, MatchId } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { NotFoundError } from '@arena/shared';
import type { BaseGameServer } from '../engines/base-game-server.js';
import type { StateBroadcaster } from './broadcast.js';

export class GameInstanceHost {
  /** The broadcaster — exposed for external subscription (websocket). */
  readonly broadcaster: StateBroadcaster;

  /** Registered game servers by game ID. */
  private readonly engines = new Map<GameId, BaseGameServer>();

  /** Maps matchId → gameId for routing. */
  private readonly matchToGame = new Map<MatchId, GameId>();

  constructor(broadcaster: StateBroadcaster) {
    this.broadcaster = broadcaster;
  }

  /**
   * Register a game engine for a given game ID. Called at boot.
   *
   * @param gameId - The game this engine handles
   * @param server - The game server instance
   */
  registerGame(gameId: GameId, server: BaseGameServer): void {
    this.engines.set(gameId, server);
  }

  /**
   * Create a match on the appropriate engine.
   *
   * @param gameId - Which game to create a match for
   * @param matchId - Unique match identifier
   * @param players - Player IDs in this match
   */
  createMatch(
    gameId: GameId,
    matchId: MatchId,
    players: readonly UserId[],
  ): void {
    const engine = this.requireEngine(gameId);
    engine.createInstance(matchId, players);
    this.matchToGame.set(matchId, gameId);

    for (const userId of players) {
      this.broadcaster.emitPlayerJoined(matchId, userId);
    }
  }

  /**
   * Destroy a match instance and clean up routing.
   *
   * @param matchId - The match to destroy
   */
  destroyMatch(matchId: MatchId): void {
    const gameId = this.matchToGame.get(matchId);
    if (!gameId) {
      return;
    }

    const engine = this.engines.get(gameId);
    if (engine) {
      engine.destroyInstance(matchId);
    }

    this.matchToGame.delete(matchId);
  }

  /**
   * Route player input to the correct engine.
   *
   * @param matchId - The match this input is for
   * @param userId - The player who sent input
   * @param input - The input data
   */
  handleInput(matchId: MatchId, userId: UserId, input: unknown): void {
    const engine = this.requireEngineForMatch(matchId);
    engine.onPlayerInput(matchId, userId, input);
  }

  /**
   * Handle a player leaving / disconnecting.
   *
   * @param matchId - The match the player left
   * @param userId - The player who left
   */
  handlePlayerLeave(matchId: MatchId, userId: UserId): void {
    const engine = this.requireEngineForMatch(matchId);
    engine.onPlayerLeave(matchId, userId);
  }

  /**
   * Get the current game state for a match.
   *
   * @param matchId - The match to get state for
   * @returns The current game state
   */
  getState(matchId: MatchId): unknown {
    const engine = this.requireEngineForMatch(matchId);
    return engine.getState(matchId);
  }

  private requireEngine(gameId: GameId): BaseGameServer {
    const engine = this.engines.get(gameId);
    if (!engine) {
      throw new NotFoundError('Game not registered', { gameId });
    }
    return engine;
  }

  private requireEngineForMatch(matchId: MatchId): BaseGameServer {
    const gameId = this.matchToGame.get(matchId);
    if (!gameId) {
      throw new NotFoundError('Match not found', { matchId });
    }

    const engine = this.engines.get(gameId);
    if (!engine) {
      throw new NotFoundError('Game engine not found for match', { matchId, gameId });
    }

    return engine;
  }
}
