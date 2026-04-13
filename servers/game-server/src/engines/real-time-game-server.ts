/**
 * Abstract base class for Engine Class A — Real-Time Continuous games.
 *
 * Manages a tick loop per instance at the configured tick rate. Subclasses
 * implement game-specific state, physics, and win conditions.
 */

import type { RealTimeGameServer } from '@arena/shared';
import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { BaseGameServer, type BaseInstanceState } from './base-game-server.js';
import type { StateBroadcaster } from '../host/broadcast.js';

/** Per-instance state for real-time games. */
export interface RealTimeInstanceState extends BaseInstanceState {
  tickCount: number;
  lastTickAt: number;
  tickInterval: ReturnType<typeof setInterval> | null;
}

/**
 * Abstract base for real-time continuous game servers (20-60hz tick loop).
 * Subclasses must define tickRate, implement game-specific onTick/getState/
 * checkWinCondition, and optionally provide a spatial grid.
 */
export abstract class RealTimeGameServerBase
  extends BaseGameServer
  implements RealTimeGameServer
{
  /** Tick rate in hertz. Subclasses set this (e.g. 20, 30, 60). */
  abstract readonly tickRate: number;

  constructor(broadcaster: StateBroadcaster) {
    super(broadcaster);
  }

  /**
   * Get the spatial hash grid for collision detection.
   * Default returns null — subclasses override when they need spatial partitioning.
   */
  spatialGrid(_matchId: MatchId): unknown {
    return null;
  }

  /** Broadcast the current game state via the broadcaster. */
  broadcastState(matchId: MatchId): void {
    const state = this.getState(matchId);
    this.broadcaster.emitState(matchId, state);
  }

  /** Start the tick loop when an instance is created. */
  protected override onInstanceCreated(state: BaseInstanceState): void {
    const rtState = state as RealTimeInstanceState;
    const intervalMs = 1000 / this.tickRate;

    rtState.tickInterval = setInterval(() => {
      if (rtState.ended) {
        return;
      }

      const now = Date.now();
      const deltaMs = now - rtState.lastTickAt;
      rtState.lastTickAt = now;
      rtState.tickCount += 1;

      this.onTick(rtState.matchId, deltaMs);

      if (this.checkWinCondition(rtState.matchId)) {
        rtState.ended = true;
        this.stopTickLoop(rtState);
        const result = this.buildMatchResult(rtState.matchId);
        this.broadcaster.emitMatchEnd(rtState.matchId, result);
      }
    }, intervalMs);
  }

  /** Stop the tick loop when an instance is destroyed. */
  protected override onInstanceDestroyed(state: BaseInstanceState): void {
    this.stopTickLoop(state as RealTimeInstanceState);
  }

  /**
   * Subclass hook: build the match result (placements) when the game ends.
   * Called when checkWinCondition returns true.
   */
  protected abstract buildMatchResult(matchId: MatchId): MatchResult;

  /** Initialize base real-time instance state. Subclasses extend via override. */
  protected override initInstanceState(
    matchId: MatchId,
    players: readonly UserId[],
  ): RealTimeInstanceState {
    return {
      matchId,
      players,
      startedAt: new Date(),
      ended: false,
      tickCount: 0,
      lastTickAt: Date.now(),
      tickInterval: null,
    };
  }

  private stopTickLoop(state: RealTimeInstanceState): void {
    if (state.tickInterval !== null) {
      clearInterval(state.tickInterval);
      state.tickInterval = null;
    }
  }
}
