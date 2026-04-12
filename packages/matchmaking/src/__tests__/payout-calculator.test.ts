import { describe, it, expect } from 'vitest';
import type { Money, MatchResult, UserId } from '@arena/shared';
import { ValidationError } from '@arena/shared';
import {
  WinnerTakesAllCalculator,
  BattleRoyaleTopThreeCalculator,
  CoinflipCalculator,
} from '../payout-calculator.js';

function makeResult(
  ...entries: Array<[string, number]>
): MatchResult {
  return entries.map(([userId, position]) => ({
    userId: userId as UserId,
    position,
    payoutCents: 0 as Money, // ignored by calculators
  }));
}

describe('WinnerTakesAllCalculator', () => {
  const calc = new WinnerTakesAllCalculator();

  it('pool 1000¢, 2 players → 1st gets 1000, 2nd gets 0', () => {
    const result = makeResult(['user-1', 1], ['user-2', 2]);
    const payouts = calc.calculate(1000 as Money, result);
    expect(payouts.find((p) => p.userId === ('user-1' as UserId))!.payoutCents).toBe(1000);
    expect(payouts.find((p) => p.userId === ('user-2' as UserId))!.payoutCents).toBe(0);
  });

  it('pool 500¢, 5 players → only 1st gets paid', () => {
    const result = makeResult(
      ['u1', 1], ['u2', 2], ['u3', 3], ['u4', 4], ['u5', 5],
    );
    const payouts = calc.calculate(500 as Money, result);
    const firstPlace = payouts.find((p) => p.userId === ('u1' as UserId))!;
    expect(firstPlace.payoutCents).toBe(500);
    const otherPayouts = payouts.filter((p) => p.userId !== ('u1' as UserId));
    for (const p of otherPayouts) {
      expect(p.payoutCents).toBe(0);
    }
  });

  it('fewer than 2 players → throws ValidationError', () => {
    const result = makeResult(['solo', 1]);
    expect(() => calc.calculate(500 as Money, result)).toThrow(ValidationError);
  });
});

describe('BattleRoyaleTopThreeCalculator', () => {
  const calc = new BattleRoyaleTopThreeCalculator();

  it('pool 1000¢, 5 players → [600, 250, 150, 0, 0]', () => {
    const result = makeResult(
      ['u1', 1], ['u2', 2], ['u3', 3], ['u4', 4], ['u5', 5],
    );
    const payouts = calc.calculate(1000 as Money, result);
    expect(payouts.find((p) => p.userId === ('u1' as UserId))!.payoutCents).toBe(600);
    expect(payouts.find((p) => p.userId === ('u2' as UserId))!.payoutCents).toBe(250);
    expect(payouts.find((p) => p.userId === ('u3' as UserId))!.payoutCents).toBe(150);
    expect(payouts.find((p) => p.userId === ('u4' as UserId))!.payoutCents).toBe(0);
    expect(payouts.find((p) => p.userId === ('u5' as UserId))!.payoutCents).toBe(0);
  });

  it('rounding: pool 1001¢ → sum still 1001 (leftover cent to 1st)', () => {
    const result = makeResult(
      ['u1', 1], ['u2', 2], ['u3', 3], ['u4', 4], ['u5', 5],
    );
    const payouts = calc.calculate(1001 as Money, result);
    const sum = payouts.reduce((s, p) => s + (p.payoutCents as number), 0);
    expect(sum).toBe(1001);
    // 2nd = floor(1001 * 0.25) = 250, 3rd = floor(1001 * 0.15) = 150, 1st = 1001 - 250 - 150 = 601
    expect(payouts.find((p) => p.userId === ('u1' as UserId))!.payoutCents).toBe(601);
    expect(payouts.find((p) => p.userId === ('u2' as UserId))!.payoutCents).toBe(250);
    expect(payouts.find((p) => p.userId === ('u3' as UserId))!.payoutCents).toBe(150);
  });

  it('small-pool rounding stays exact for pools 1, 2, 3, and 5', () => {
    const result = makeResult(
      ['u1', 1], ['u2', 2], ['u3', 3], ['u4', 4], ['u5', 5],
    );

    expect(calc.calculate(1 as Money, result).map((p) => p.payoutCents)).toEqual([1, 0, 0, 0, 0]);
    expect(calc.calculate(2 as Money, result).map((p) => p.payoutCents)).toEqual([2, 0, 0, 0, 0]);
    expect(calc.calculate(3 as Money, result).map((p) => p.payoutCents)).toEqual([3, 0, 0, 0, 0]);
    expect(calc.calculate(5 as Money, result).map((p) => p.payoutCents)).toEqual([4, 1, 0, 0, 0]);
  });

  it('invariant: across random pool sizes 1-100000, sum always equals pool', () => {
    for (let i = 0; i < 100; i++) {
      const pool = Math.floor(Math.random() * 100000) + 1;
      const result = makeResult(
        ['u1', 1], ['u2', 2], ['u3', 3], ['u4', 4], ['u5', 5],
      );
      const payouts = calc.calculate(pool as Money, result);
      const sum = payouts.reduce((s, p) => s + (p.payoutCents as number), 0);
      expect(sum).toBe(pool);
    }
  });

  it('fewer than 3 players → throws ValidationError', () => {
    const result = makeResult(['u1', 1], ['u2', 2]);
    expect(() => calc.calculate(1000 as Money, result)).toThrow(ValidationError);
  });
});

describe('CoinflipCalculator', () => {
  const calc = new CoinflipCalculator();

  it('pool 900¢, 2 players → 1st gets 900, 2nd gets 0', () => {
    const result = makeResult(['user-a', 1], ['user-b', 2]);
    const payouts = calc.calculate(900 as Money, result);
    expect(payouts.find((p) => p.userId === ('user-a' as UserId))!.payoutCents).toBe(900);
    expect(payouts.find((p) => p.userId === ('user-b' as UserId))!.payoutCents).toBe(0);
  });

  it('sum equals pool', () => {
    const result = makeResult(['a', 1], ['b', 2]);
    const payouts = calc.calculate(1234 as Money, result);
    const sum = payouts.reduce((s, p) => s + (p.payoutCents as number), 0);
    expect(sum).toBe(1234);
  });

  it('not-exactly-2 players → throws ValidationError', () => {
    const result = makeResult(['a', 1], ['b', 2], ['c', 3]);
    expect(() => calc.calculate(1234 as Money, result)).toThrow(ValidationError);
  });
});
