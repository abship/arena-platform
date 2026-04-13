/**
 * TEST REFERENCE — NOT A REAL GAME.
 *
 * Minimal turn-based game for proving TurnBasedGameServerBase works.
 * Players take turns adding 1 to a shared total. First to reach 10 wins.
 */

import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import type { Money } from '@arena/shared';
import {
  TurnBasedGameServerBase,
  type TurnBasedInstanceState,
} from '../engines/turn-based-game-server.js';

export interface TurnBasedRefState extends TurnBasedInstanceState {
  total: number;
  readonly winTarget: number;
  winner: UserId | null;
}

interface IncrementAction {
  readonly increment: number;
}

const WIN_TARGET = 10;

export class ReferenceTurnBasedGame extends TurnBasedGameServerBase {
  override checkWinCondition(matchId: MatchId): boolean {
    const state = this.requireInstance(matchId) as TurnBasedRefState;
    if (state.total >= state.winTarget) {
      const lastAction = state.actionsLog[state.actionsLog.length - 1];
      if (lastAction) {
        state.winner = lastAction.userId;
      }
      return true;
    }
    return false;
  }

  override getState(matchId: MatchId): unknown {
    const state = this.requireInstance(matchId) as TurnBasedRefState;
    return {
      matchId: state.matchId,
      total: state.total,
      winTarget: state.winTarget,
      currentPlayerIndex: state.currentPlayerIndex,
      players: state.players,
      ended: state.ended,
      winner: state.winner,
    };
  }

  protected override initInstanceState(
    matchId: MatchId,
    players: readonly UserId[],
  ): TurnBasedRefState {
    const base = super.initInstanceState(matchId, players);
    return {
      ...base,
      total: 0,
      winTarget: WIN_TARGET,
      winner: null,
    };
  }

  protected applyAction(
    state: TurnBasedInstanceState,
    _userId: UserId,
    action: unknown,
  ): void {
    const { increment } = action as IncrementAction;
    (state as TurnBasedRefState).total += increment;
  }

  protected isActionLegal(
    _state: TurnBasedInstanceState,
    _userId: UserId,
    action: unknown,
  ): boolean {
    const { increment } = action as IncrementAction;
    return increment === 1;
  }

  protected buildMatchResult(matchId: MatchId): MatchResult {
    const state = this.requireInstance(matchId) as TurnBasedRefState;
    return state.players.map((userId, index) => ({
      userId,
      position: userId === state.winner ? 1 : index + 1 === 1 ? 2 : index + 1,
      payoutCents: 0 as Money,
    }));
  }
}
