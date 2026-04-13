/**
 * TEST REFERENCE — NOT A REAL GAME.
 *
 * Minimal parallel game for proving ParallelGameServerBase works.
 * Challenge: array of 10 random numbers (0-9). Players race to sum them.
 * Progress is { currentSum: number }. Finished when currentSum === targetSum.
 */

import { randomInt } from 'node:crypto';
import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import type { Money } from '@arena/shared';
import {
  ParallelGameServerBase,
  type ParallelInstanceState,
} from '../engines/parallel-game-server.js';

interface SumChallenge {
  readonly numbers: readonly number[];
  readonly targetSum: number;
}

interface SumProgress {
  readonly currentSum: number;
}

export class ReferenceParallelGame extends ParallelGameServerBase {
  protected buildChallenge(_players: readonly UserId[]): SumChallenge {
    const numbers: number[] = [];
    let targetSum = 0;
    for (let i = 0; i < 10; i++) {
      const n = randomInt(0, 10);
      numbers.push(n);
      targetSum += n;
    }
    return { numbers, targetSum };
  }

  protected isPlayerFinished(
    state: ParallelInstanceState,
    userId: UserId,
  ): boolean {
    const challenge = state.challenge as SumChallenge;
    const playerProgress = state.perPlayerProgress.get(userId);
    if (!playerProgress?.progress) {
      return false;
    }
    const progress = playerProgress.progress as SumProgress;
    return progress.currentSum === challenge.targetSum;
  }

  protected override getProgressScore(progress: unknown): number {
    if (!progress) {
      return 0;
    }
    return (progress as SumProgress).currentSum;
  }

  protected buildMatchResult(matchId: MatchId): MatchResult {
    const ranked = this.compareResults(matchId);
    return ranked.map((userId, index) => ({
      userId,
      position: index + 1,
      payoutCents: 0 as Money,
    }));
  }
}
