/**
 * Money-related constants and helpers for the Arena.gg platform.
 * All monetary values are in USD cents (integer).
 */

import type { Money } from '../types/wallet.js';

/** Rake percentage for entry fees under $1.00 (under 100 cents). */
export const RAKE_UNDER_1_DOLLAR = 0.10;

/** Rake percentage for entry fees between $1.00 and $10.00 (100–1000 cents). */
export const RAKE_1_TO_10 = 0.08;

/** Rake percentage for entry fees over $10.00 (over 1000 cents). */
export const RAKE_OVER_10 = 0.05;

/** Minimum seconds a player must be alive before cashing out in progressive pool games. */
export const MIN_CASH_OUT_SECONDS = 60;

/** Starting fake balance for new users in USD cents ($100.00). */
export const NEW_USER_FAKE_BALANCE_CENTS = 10_000 as Money;

/**
 * Calculate the rake amount for an entry fee based on the tiered rake schedule.
 *
 * - Under $1.00 (< 100 cents): 10% rake
 * - $1.00–$10.00 (100–1000 cents): 8% rake
 * - Over $10.00 (> 1000 cents): 5% rake
 *
 * @param entryFeeCents - The entry fee in USD cents
 * @returns The rake amount in USD cents, rounded down to the nearest cent
 */
export function calculateRake(entryFeeCents: Money): Money {
  let rate: number;

  if (entryFeeCents < 100) {
    rate = RAKE_UNDER_1_DOLLAR;
  } else if (entryFeeCents <= 1000) {
    rate = RAKE_1_TO_10;
  } else {
    rate = RAKE_OVER_10;
  }

  return Math.floor(entryFeeCents * rate) as Money;
}
