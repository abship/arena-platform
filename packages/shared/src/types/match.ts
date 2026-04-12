/**
 * Match and matchmaking types for the Arena.gg platform.
 */

import type { UserId } from './user.js';
import type { Money } from './wallet.js';
import type { GameId } from './game.js';

/** Branded string type for match IDs. */
export type MatchId = string & { readonly __brand: 'MatchId' };

/** The lifecycle status of a match. */
export enum MatchStatus {
  QUEUED = 'QUEUED',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}

/** A player's final placement and payout in a resolved match. */
export interface Placement {
  /** The player who earned this placement. */
  readonly userId: UserId;
  /** Finishing position (1 = first place). */
  readonly position: number;
  /** Amount awarded in USD cents. */
  readonly payoutCents: Money;
}

/** The result of a completed match — an ordered array of placements. */
export type MatchResult = readonly Placement[];

/** A competitive match between players. */
export interface Match {
  /** Unique match identifier. */
  readonly id: MatchId;
  /** The game being played. */
  readonly gameId: GameId;
  /** Current lifecycle status. */
  readonly status: MatchStatus;
  /** Entry fee per player in USD cents. */
  readonly entryFeeCents: Money;
  /** Total prize pool in USD cents. */
  readonly prizePoolCents: Money;
  /** Rake taken by the platform in USD cents. */
  readonly rakeCents: Money;
  /** Player placements (populated after match resolves). */
  readonly result: MatchResult | null;
  /** When the match started (null if still queued). */
  readonly startedAt: Date | null;
  /** When the match ended (null if not yet resolved). */
  readonly endedAt: Date | null;
}
