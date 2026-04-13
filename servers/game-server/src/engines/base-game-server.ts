/**
 * Abstract base class for all game server engine types.
 *
 * Manages per-match instance state in an in-memory Map. Subclasses define
 * the concrete state shape and game-specific behavior. This class implements
 * the base GameServer interface from @arena/shared.
 */

import type { GameServer } from '@arena/shared';
import type { MatchId } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { NotFoundError, ValidationError } from '@arena/shared';
import type { StateBroadcaster } from '../host/broadcast.js';

/** Minimum per-instance state that all engine types share. */
export interface BaseInstanceState {
  readonly matchId: MatchId;
  readonly players: readonly UserId[];
  readonly startedAt: Date;
  ended: boolean;
}

/**
 * Abstract base game server. Not intended to be directly extended by games —
 * games extend one of the four engine-specific subclasses instead.
 */
export abstract class BaseGameServer implements GameServer {
  protected readonly instances = new Map<MatchId, BaseInstanceState>();
  protected readonly broadcaster: StateBroadcaster;

  constructor(broadcaster: StateBroadcaster) {
    this.broadcaster = broadcaster;
  }

  /**
   * Create a new game instance for a match.
   *
   * @param matchId - Unique match identifier
   * @param players - Ordered list of player IDs in this match
   */
  createInstance(matchId: MatchId, players: readonly UserId[]): void {
    if (this.instances.has(matchId)) {
      throw new ValidationError('Instance already exists for match', { matchId });
    }

    const state = this.initInstanceState(matchId, players);
    this.instances.set(matchId, state);
    this.onInstanceCreated(state);
  }

  /**
   * Destroy a game instance. Idempotent — no-op if the instance doesn't exist.
   *
   * @param matchId - The match to destroy
   */
  destroyInstance(matchId: MatchId): void {
    const state = this.instances.get(matchId);
    if (!state) {
      return;
    }

    this.onInstanceDestroyed(state);
    this.instances.delete(matchId);
  }

  /** Check whether an instance exists for the given match. */
  hasInstance(matchId: MatchId): boolean {
    return this.instances.has(matchId);
  }

  /** @inheritdoc */
  onPlayerJoin(matchId: MatchId, userId: UserId): void {
    this.requireInstance(matchId);
    this.broadcaster.emitPlayerJoined(matchId, userId);
  }

  /** @inheritdoc */
  onPlayerInput(matchId: MatchId, _userId: UserId, _input: unknown): void {
    this.requireInstance(matchId);
  }

  /** @inheritdoc */
  onTick(matchId: MatchId, _deltaMs: number): void {
    this.requireInstance(matchId);
  }

  /** @inheritdoc */
  onPlayerLeave(matchId: MatchId, userId: UserId): void {
    this.requireInstance(matchId);
    this.broadcaster.emitPlayerLeft(matchId, userId);
  }

  /** @inheritdoc */
  getState(matchId: MatchId): unknown {
    return this.requireInstance(matchId);
  }

  /** @inheritdoc */
  checkWinCondition(matchId: MatchId): boolean {
    const state = this.requireInstance(matchId);
    return state.ended;
  }

  /** Look up an instance, throwing NotFoundError if missing. */
  protected requireInstance(matchId: MatchId): BaseInstanceState {
    const state = this.instances.get(matchId);
    if (!state) {
      throw new NotFoundError('Game instance not found', { matchId });
    }
    return state;
  }

  /**
   * Subclass hook: create the per-instance state shape.
   * Called during createInstance before onInstanceCreated.
   */
  protected abstract initInstanceState(
    matchId: MatchId,
    players: readonly UserId[],
  ): BaseInstanceState;

  /**
   * Subclass hook: called after an instance is created and stored.
   * Override to start timers, initialize resources, etc.
   */
  protected onInstanceCreated(_state: BaseInstanceState): void {
    // Default no-op; subclasses override as needed.
  }

  /**
   * Subclass hook: called before an instance is removed from the map.
   * Override to stop timers, release resources, etc.
   */
  protected onInstanceDestroyed(_state: BaseInstanceState): void {
    // Default no-op; subclasses override as needed.
  }
}
