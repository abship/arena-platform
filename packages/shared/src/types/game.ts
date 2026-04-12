/**
 * Game metadata and classification types for the Arena.gg platform.
 */

import type { Money } from './wallet.js';

/** Branded string type for game IDs. */
export type GameId = string & { readonly __brand: 'GameId' };

/**
 * Legal classification tier based on skill-to-chance ratio.
 *
 * - TIER_1: 80%+ skill — legal in most US states without gambling license
 * - TIER_2: 60-80% skill — legal in Dominant Factor test states
 * - TIER_3: 40-60% skill — needs gambling license in most US states
 * - TIER_4: Under 40% skill — full gambling, requires licenses everywhere
 */
export enum GameTier {
  TIER_1 = 1,
  TIER_2 = 2,
  TIER_3 = 3,
  TIER_4 = 4,
}

/**
 * Game engine class determining the server architecture pattern.
 *
 * - REAL_TIME_CONTINUOUS: Tick-based loop at 20-60hz (agario, slitherio, etc.)
 * - TURN_BASED: Event-driven state machine (poker, blackjack, etc.)
 * - ALGORITHM: Provably fair RNG outcome (plinko, crash, etc.)
 * - PARALLEL: Identical inputs, independent play, compare results (tetris-duel, etc.)
 */
export enum EngineClass {
  REAL_TIME_CONTINUOUS = 'REAL_TIME_CONTINUOUS',
  TURN_BASED = 'TURN_BASED',
  ALGORITHM = 'ALGORITHM',
  PARALLEL = 'PARALLEL',
}

/**
 * How money flows in and out of a game.
 *
 * - PROGRESSIVE_POOL: Kill-to-earn with cash-out (agario, slitherio, diep, hole)
 * - FIXED_POT: Entry fees pooled, winner(s) split minus rake
 * - HOUSE_EDGE: Player vs platform, expected value below bet
 * - CRASH: Rising multiplier, cash out before crash point
 * - COINFLIP: Two players, equal bets, 50/50, winner takes both minus rake
 */
export enum MoneyModel {
  PROGRESSIVE_POOL = 'PROGRESSIVE_POOL',
  FIXED_POT = 'FIXED_POT',
  HOUSE_EDGE = 'HOUSE_EDGE',
  CRASH = 'CRASH',
  COINFLIP = 'COINFLIP',
}

/** Static metadata describing a game on the platform. */
export interface GameMetadata {
  /** Unique game identifier. */
  readonly id: GameId;
  /** Display name of the game. */
  readonly name: string;
  /** Legal classification tier. */
  readonly tier: GameTier;
  /** Server architecture pattern. */
  readonly engineClass: EngineClass;
  /** How money flows in this game. */
  readonly moneyModel: MoneyModel;
  /** Minimum players required to start a match. */
  readonly minPlayers: number;
  /** Maximum players allowed in a match. */
  readonly maxPlayers: number;
  /** Entry fee in USD cents. */
  readonly entryFeeCents: Money;
}
