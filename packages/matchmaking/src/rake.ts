/**
 * Rake calculation utility for the Arena.gg platform.
 *
 * Rake tiers (per player entry fee):
 * - Under $1 (< 100¢): 10%
 * - $1–$10 (100¢–1000¢): 8%
 * - Over $10 (> 1000¢): 5%
 *
 * Applied to the total pool (entryFeeCents * numPlayers).
 * Floor rounding on rake ensures no fractional cents.
 * Invariant: rakeCents + prizePoolCents === totalPool, always.
 */

import type { Money } from '@arena/shared';
import { ValidationError } from '@arena/shared';

/**
 * Compute the rake and prize pool for a match.
 * @param entryFeeCents - Entry fee per player in integer USD cents
 * @param numPlayers - Number of players in the match
 * @returns rakeCents and prizePoolCents, both as integer Money values
 */
export function computeRake(
  entryFeeCents: Money,
  numPlayers: number,
): { rakeCents: Money; prizePoolCents: Money } {
  if (
    !Number.isFinite(entryFeeCents as number) ||
    !Number.isInteger(entryFeeCents as number) ||
    (entryFeeCents as number) <= 0
  ) {
    throw new ValidationError('entryFeeCents must be a positive integer', {
      entryFeeCents,
    });
  }

  if (!Number.isFinite(numPlayers) || !Number.isInteger(numPlayers) || numPlayers < 2) {
    throw new ValidationError('numPlayers must be an integer >= 2', {
      numPlayers,
    });
  }

  const totalPool = (entryFeeCents as number) * numPlayers;

  let rakePercent: number;
  if ((entryFeeCents as number) < 100) {
    rakePercent = 10;
  } else if ((entryFeeCents as number) <= 1000) {
    rakePercent = 8;
  } else {
    rakePercent = 5;
  }

  const rakeCents = Math.floor(totalPool * rakePercent / 100) as Money;
  const prizePoolCents = (totalPool - (rakeCents as number)) as Money;

  return { rakeCents, prizePoolCents };
}
