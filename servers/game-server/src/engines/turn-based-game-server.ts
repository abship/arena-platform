/**
 * Abstract base class for Engine Class B — Turn-Based / Event-Driven games.
 *
 * No game loop. Server processes player actions as they arrive, validates
 * against game rules, updates state, and broadcasts. Event-driven state machine.
 */

import type { TurnBasedGameServer } from '@arena/shared';
import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { ValidationError } from '@arena/shared';
import { BaseGameServer, type BaseInstanceState } from './base-game-server.js';
import type { StateBroadcaster } from '../host/broadcast.js';

/** A recorded action in the turn history. */
export interface ActionRecord {
  readonly userId: UserId;
  readonly action: unknown;
  readonly timestamp: Date;
}

/** Per-instance state for turn-based games. */
export interface TurnBasedInstanceState extends BaseInstanceState {
  currentPlayerIndex: number;
  actionsLog: ActionRecord[];
}

/**
 * Abstract base for turn-based game servers.
 * Subclasses define game-specific action application, legality rules,
 * and win conditions.
 */
export abstract class TurnBasedGameServerBase
  extends BaseGameServer
  implements TurnBasedGameServer
{
  constructor(broadcaster: StateBroadcaster) {
    super(broadcaster);
  }

  /**
   * Process a player action: validate, apply, log, check win, advance turn.
   *
   * @param matchId - The match this action is for
   * @param userId - The player taking the action
   * @param action - The action data
   */
  processAction(matchId: MatchId, userId: UserId, action: unknown): void {
    const state = this.requireInstance(matchId) as TurnBasedInstanceState;

    if (state.ended) {
      throw new ValidationError('Match has already ended', { matchId });
    }

    if (!this.validateAction(matchId, userId, action)) {
      throw new ValidationError('Illegal action', { matchId, userId });
    }

    this.applyAction(state, userId, action);
    state.actionsLog.push({ userId, action, timestamp: new Date() });

    this.broadcastState(matchId);

    if (this.checkWinCondition(matchId)) {
      state.ended = true;
      const result = this.buildMatchResult(matchId);
      this.broadcaster.emitMatchEnd(matchId, result);
      return;
    }

    this.nextTurn(matchId);
  }

  /**
   * Validate whether an action is legal.
   * Default: checks that it's the player's turn AND the subclass deems it legal.
   */
  validateAction(matchId: MatchId, userId: UserId, action: unknown): boolean {
    const state = this.requireInstance(matchId) as TurnBasedInstanceState;
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (userId !== currentPlayer) {
      return false;
    }
    return this.isActionLegal(state, userId, action);
  }

  /** Advance to the next player's turn with wrap-around. */
  nextTurn(matchId: MatchId): void {
    const state = this.requireInstance(matchId) as TurnBasedInstanceState;
    state.currentPlayerIndex =
      (state.currentPlayerIndex + 1) % state.players.length;
    this.broadcastState(matchId);
  }

  /** Broadcast the current game state via the broadcaster. */
  protected broadcastState(matchId: MatchId): void {
    const state = this.getState(matchId);
    this.broadcaster.emitState(matchId, state);
  }

  /** Initialize base turn-based instance state. */
  protected override initInstanceState(
    matchId: MatchId,
    players: readonly UserId[],
  ): TurnBasedInstanceState {
    return {
      matchId,
      players,
      startedAt: new Date(),
      ended: false,
      currentPlayerIndex: 0,
      actionsLog: [],
    };
  }

  /**
   * Subclass: apply the action to the game state (mutate in place).
   * Called after validation passes.
   */
  protected abstract applyAction(
    state: TurnBasedInstanceState,
    userId: UserId,
    action: unknown,
  ): void;

  /**
   * Subclass: determine whether the action is legal given current game state.
   * Called from validateAction after turn-order check passes.
   */
  protected abstract isActionLegal(
    state: TurnBasedInstanceState,
    userId: UserId,
    action: unknown,
  ): boolean;

  /**
   * Subclass: build the match result (placements) when the game ends.
   */
  protected abstract buildMatchResult(matchId: MatchId): MatchResult;
}
