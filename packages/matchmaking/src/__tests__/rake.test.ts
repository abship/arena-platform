import { describe, it, expect } from 'vitest';
import type { Money } from '@arena/shared';
import { ValidationError } from '@arena/shared';
import { computeRake } from '../rake.js';

describe('computeRake', () => {
  it('under-$1 tier: 50¢ entry, 2 players → total 100¢, rake 10¢, pool 90¢', () => {
    const { rakeCents, prizePoolCents } = computeRake(50 as Money, 2);
    expect(rakeCents).toBe(10);
    expect(prizePoolCents).toBe(90);
  });

  it('$1–$10 tier: $5 entry (500¢), 4 players → total 2000¢, rake 160¢, pool 1840¢', () => {
    const { rakeCents, prizePoolCents } = computeRake(500 as Money, 4);
    expect(rakeCents).toBe(160);
    expect(prizePoolCents).toBe(1840);
  });

  it('over-$10 tier: $20 entry (2000¢), 10 players → total 20000¢, rake 1000¢, pool 19000¢', () => {
    const { rakeCents, prizePoolCents } = computeRake(2000 as Money, 10);
    expect(rakeCents).toBe(1000);
    expect(prizePoolCents).toBe(19000);
  });

  it('invariant: rake + pool === total across 100 random fee/player combos', () => {
    for (let i = 0; i < 100; i++) {
      const fee = Math.floor(Math.random() * 5000) + 1;
      const players = Math.floor(Math.random() * 48) + 2;
      const { rakeCents, prizePoolCents } = computeRake(fee as Money, players);
      const total = fee * players;
      expect((rakeCents as number) + (prizePoolCents as number)).toBe(total);
    }
  });

  it('floor rounding: $1.37 (137¢), 3 players, tier 8% → total 411¢, rake 32¢, pool 379¢', () => {
    const { rakeCents, prizePoolCents } = computeRake(137 as Money, 3);
    // 137¢ is in the $1–$10 tier (8%)
    // total = 411¢, rake = floor(411 * 8 / 100) = floor(32.88) = 32
    expect(rakeCents).toBe(32);
    expect(prizePoolCents).toBe(379);
    expect((rakeCents as number) + (prizePoolCents as number)).toBe(411);
  });

  it('boundary: exactly 100¢ → $1–$10 tier (8%)', () => {
    const { rakeCents, prizePoolCents } = computeRake(100 as Money, 2);
    // total = 200, rake = floor(16) = 16
    expect(rakeCents).toBe(16);
    expect(prizePoolCents).toBe(184);
  });

  it('boundary: exactly 1000¢ → $1–$10 tier (8%)', () => {
    const { rakeCents, prizePoolCents } = computeRake(1000 as Money, 2);
    // total = 2000, rake = floor(160) = 160
    expect(rakeCents).toBe(160);
    expect(prizePoolCents).toBe(1840);
  });

  it('boundary: 1001¢ → over-$10 tier (5%)', () => {
    const { rakeCents, prizePoolCents } = computeRake(1001 as Money, 2);
    // total = 2002, rake = floor(100.1) = 100
    expect(rakeCents).toBe(100);
    expect(prizePoolCents).toBe(1902);
  });

  it('rejects non-integer entry fees', () => {
    expect(() => computeRake(12.5 as Money, 2)).toThrow(ValidationError);
  });

  it('rejects invalid player counts', () => {
    expect(() => computeRake(100 as Money, 1)).toThrow(ValidationError);
    expect(() => computeRake(100 as Money, 0)).toThrow(ValidationError);
    expect(() => computeRake(100 as Money, -1)).toThrow(ValidationError);
    expect(() => computeRake(100 as Money, 2.5)).toThrow(ValidationError);
  });
});
