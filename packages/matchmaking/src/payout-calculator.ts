/**
 * Payout calculator interface and implementations for the Arena.gg platform.
 *
 * Each money model gets its own PayoutCalculator implementation. The matchmaking
 * service receives a Map<GameId, PayoutCalculator> via DI — it is game-model-agnostic.
 *
 * New money models (progressive pool, house edge) get added as new calculator
 * classes without touching matchmaking-service.ts.
 */

import type { Money, MatchResult, GameId } from '@arena/shared';
import type { UserId } from '@arena/shared';

/** Calculates prize distribution for a resolved match. */
export interface PayoutCalculator {
  /**
   * Calculate per-player payouts from the prize pool based on match results.
   * @param prizePoolCents - Total prize pool in integer USD cents
   * @param result - Ordered placements from the game server
   * @returns Array of userId + payoutCents pairs. Sum MUST equal prizePoolCents exactly.
   */
  calculate(
    prizePoolCents: Money,
    result: MatchResult,
  ): readonly { userId: UserId; payoutCents: Money }[];
}

/**
 * Winner takes all: 1st place gets the full pool, everyone else gets 0.
 * Used for 1v1 matches and fixed-pot games with a single winner.
 */
export class WinnerTakesAllCalculator implements PayoutCalculator {
  calculate(
    prizePoolCents: Money,
    result: MatchResult,
  ): readonly { userId: UserId; payoutCents: Money }[] {
    // Sort by position ascending to find 1st place
    const sorted = [...result].sort((a, b) => a.position - b.position);

    return sorted.map((placement, idx) => ({
      userId: placement.userId,
      payoutCents: (idx === 0 ? prizePoolCents : 0) as Money,
    }));
  }
}

/**
 * Battle royale top 3 split: 1st = 60%, 2nd = 25%, 3rd = 15%.
 *
 * Uses integer cents with floor rounding. Leftover cent(s) from rounding
 * go to 1st place to ensure sum always equals prizePoolCents exactly.
 */
export class BattleRoyaleTopThreeCalculator implements PayoutCalculator {
  calculate(
    prizePoolCents: Money,
    result: MatchResult,
  ): readonly { userId: UserId; payoutCents: Money }[] {
    const pool = prizePoolCents as number;
    const sorted = [...result].sort((a, b) => a.position - b.position);

    // Floor-round 2nd and 3rd place payouts
    const secondPayout = Math.floor(pool * 25 / 100);
    const thirdPayout = Math.floor(pool * 15 / 100);
    // 1st place gets the remainder — absorbs any leftover cents from rounding
    const firstPayout = pool - secondPayout - thirdPayout;

    return sorted.map((placement) => {
      let payout: number;
      if (placement.position === 1) {
        payout = firstPayout;
      } else if (placement.position === 2) {
        payout = secondPayout;
      } else if (placement.position === 3) {
        payout = thirdPayout;
      } else {
        payout = 0;
      }
      return { userId: placement.userId, payoutCents: payout as Money };
    });
  }
}

/**
 * Coinflip: 1st place gets the full pool, 2nd gets 0.
 * Simple 2-player case, identical to WinnerTakesAll but semantically distinct.
 */
export class CoinflipCalculator implements PayoutCalculator {
  calculate(
    prizePoolCents: Money,
    result: MatchResult,
  ): readonly { userId: UserId; payoutCents: Money }[] {
    const sorted = [...result].sort((a, b) => a.position - b.position);

    return sorted.map((placement, idx) => ({
      userId: placement.userId,
      payoutCents: (idx === 0 ? prizePoolCents : 0) as Money,
    }));
  }
}

/**
 * Default calculator map — intentionally empty.
 *
 * The API layer populates this with game-to-calculator mappings when it wires up
 * the service. Matchmaking is game-model-agnostic; callers inject the mapping.
 */
export const DEFAULT_CALCULATORS: Map<GameId, PayoutCalculator> = new Map();
