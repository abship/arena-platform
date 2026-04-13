/**
 * TEST REFERENCE — NOT A REAL GAME.
 *
 * Minimal real-time game for proving the RealTimeGameServerBase works.
 * Each tick increments a shared counter. When counter reaches the target,
 * the first player in the list wins (deterministic for tests).
 */

import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import type { Money } from '@arena/shared';
import {
  RealTimeGameServerBase,
  type RealTimeInstanceState,
} from '../engines/real-time-game-server.js';

export interface RealTimeRefState extends RealTimeInstanceState {
  counter: number;
  readonly winTarget: number;
}

const WIN_TARGET = 10;

export class ReferenceRealTimeGame extends RealTimeGameServerBase {
  readonly tickRate = 20;

  override onTick(matchId: MatchId, deltaMs: number): void {
    super.onTick(matchId, deltaMs);
    const state = this.instances.get(matchId) as RealTimeRefState | undefined;
    if (!state || state.ended) {
      return;
    }
    state.counter += 1;
    this.broadcastState(matchId);
  }

  override checkWinCondition(matchId: MatchId): boolean {
    const state = this.requireInstance(matchId) as RealTimeRefState;
    return state.counter >= state.winTarget;
  }

  override getState(matchId: MatchId): unknown {
    const state = this.requireInstance(matchId) as RealTimeRefState;
    return {
      matchId: state.matchId,
      counter: state.counter,
      winTarget: state.winTarget,
      players: state.players,
      ended: state.ended,
    };
  }

  protected override initInstanceState(
    matchId: MatchId,
    players: readonly UserId[],
  ): RealTimeRefState {
    const base = super.initInstanceState(matchId, players);
    return {
      ...base,
      counter: 0,
      winTarget: WIN_TARGET,
    };
  }

  protected buildMatchResult(matchId: MatchId): MatchResult {
    const state = this.requireInstance(matchId) as RealTimeRefState;
    return state.players.map((userId, index) => ({
      userId,
      position: index + 1,
      payoutCents: 0 as Money,
    }));
  }
}
