/**
 * Abstract base class for Engine Class D — Synchronized Parallel Competition.
 *
 * Both players receive identical inputs from the server. They play independently.
 * Server tracks progress and compares results when done.
 */

import type { ParallelGameServer } from '@arena/shared';
import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { BaseGameServer, type BaseInstanceState } from './base-game-server.js';
import type { StateBroadcaster } from '../host/broadcast.js';

/** Per-player progress tracking. */
export interface PlayerProgress {
  progress: unknown;
  finishedAt: number | null;
}

/** Per-instance state for parallel games. */
export interface ParallelInstanceState extends BaseInstanceState {
  readonly challenge: unknown;
  readonly perPlayerProgress: Map<UserId, PlayerProgress>;
}

/**
 * Abstract base for synchronized parallel game servers.
 * Subclasses define challenge generation, progress tracking, and finish detection.
 */
export abstract class ParallelGameServerBase
  extends BaseGameServer
  implements ParallelGameServer
{
  constructor(broadcaster: StateBroadcaster) {
    super(broadcaster);
  }

  /**
   * Return the stored challenge for the match. Pure read.
   */
  generateChallenge(matchId: MatchId): unknown {
    const state = this.requireInstance(matchId) as ParallelInstanceState;
    return state.challenge;
  }

  /**
   * Track a player's progress. If the player finishes, records their finish time.
   * When all players finish, ends the match.
   */
  trackProgress(matchId: MatchId, userId: UserId, progress: unknown): void {
    const state = this.requireInstance(matchId) as ParallelInstanceState;

    const playerProgress = state.perPlayerProgress.get(userId);
    if (!playerProgress) {
      return;
    }

    playerProgress.progress = progress;

    if (
      playerProgress.finishedAt === null &&
      this.isPlayerFinished(state, userId)
    ) {
      playerProgress.finishedAt = Date.now();
    }

    this.broadcastState(matchId);

    const allFinished = [...state.perPlayerProgress.values()].every(
      (p) => p.finishedAt !== null,
    );

    if (allFinished) {
      state.ended = true;
      const result = this.buildMatchResult(matchId);
      this.broadcaster.emitMatchEnd(matchId, result);
    }
  }

  /**
   * Compare results between all players and return ordered user IDs.
   * Default ordering: by progress score DESC, then finishedAt ASC (ties broken by who finished first).
   * Subclasses can override compareOrder for different logic.
   */
  compareResults(matchId: MatchId): readonly UserId[] {
    const state = this.requireInstance(matchId) as ParallelInstanceState;
    const entries = [...state.perPlayerProgress.entries()];

    entries.sort((a, b) => {
      const scoreA = this.getProgressScore(a[1].progress);
      const scoreB = this.getProgressScore(b[1].progress);

      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }

      const finA = a[1].finishedAt ?? Number.MAX_SAFE_INTEGER;
      const finB = b[1].finishedAt ?? Number.MAX_SAFE_INTEGER;
      return finA - finB;
    });

    return entries.map(([userId]) => userId);
  }

  /** Broadcast the current game state via the broadcaster. */
  protected broadcastState(matchId: MatchId): void {
    const state = this.getState(matchId);
    this.broadcaster.emitState(matchId, state);
  }

  /** Initialize parallel instance state with the generated challenge. */
  protected override initInstanceState(
    matchId: MatchId,
    players: readonly UserId[],
  ): ParallelInstanceState {
    const challenge = this.buildChallenge(players);
    const perPlayerProgress = new Map<UserId, PlayerProgress>();

    for (const userId of players) {
      perPlayerProgress.set(userId, { progress: null, finishedAt: null });
    }

    return {
      matchId,
      players,
      startedAt: new Date(),
      ended: false,
      challenge,
      perPlayerProgress,
    };
  }

  /**
   * Subclass: generate the identical challenge all players will receive.
   */
  protected abstract buildChallenge(players: readonly UserId[]): unknown;

  /**
   * Subclass: determine whether a player has finished the challenge.
   */
  protected abstract isPlayerFinished(
    state: ParallelInstanceState,
    userId: UserId,
  ): boolean;

  /**
   * Extract a numeric score from progress data for comparison.
   * Default returns 0 — subclasses override for their progress shape.
   */
  protected getProgressScore(_progress: unknown): number {
    return 0;
  }

  /**
   * Subclass: build the match result (placements) when the game ends.
   */
  protected abstract buildMatchResult(matchId: MatchId): MatchResult;
}
