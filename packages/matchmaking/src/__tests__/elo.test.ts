import { describe, it, expect } from 'vitest';
import { updateElo } from '../elo.js';

describe('updateElo', () => {
  it('1v1 equal-rating win: winner gains ~16, loser loses ~16', () => {
    const [winner, loser] = updateElo([1200, 1200], [1, 2]);
    // Expected: 1200 + 32*(1 - 0.5) = 1216 for winner, 1200 + 32*(0 - 0.5) = 1184 for loser
    expect(winner).toBe(1216);
    expect(loser).toBe(1184);
  });

  it('1v1 upset: 1200 beats 1400 → approximately [1220, 1380]', () => {
    const [winner, loser] = updateElo([1200, 1400], [1, 2]);
    // expected_1200 = 1 / (1 + 10^(200/400)) ≈ 0.2403
    // delta_winner = 32 * (1 - 0.2403) ≈ 24.31 → 1200 + 24 = 1224
    // delta_loser = 32 * (0 - 0.7597) ≈ -24.31 → 1400 - 24 = 1376
    expect(winner).toBeGreaterThanOrEqual(1220);
    expect(winner).toBeLessThanOrEqual(1225);
    expect(loser).toBeGreaterThanOrEqual(1375);
    expect(loser).toBeLessThanOrEqual(1380);
  });

  it('1v1 expected result: 1400 beats 1200 → small rating change', () => {
    const [winner, loser] = updateElo([1400, 1200], [1, 2]);
    // expected_1400 ≈ 0.7597
    // delta_winner = 32 * (1 - 0.7597) ≈ 7.69 → 1400 + 8 = 1408
    // delta_loser = 32 * (0 - 0.2403) ≈ -7.69 → 1200 - 8 = 1192
    expect(winner).toBeGreaterThanOrEqual(1406);
    expect(winner).toBeLessThanOrEqual(1410);
    expect(loser).toBeGreaterThanOrEqual(1190);
    expect(loser).toBeLessThanOrEqual(1194);
  });

  it('4-player BR: all 1200, placements [1,2,3,4] → 1st gains most, 4th loses most', () => {
    const results = updateElo([1200, 1200, 1200, 1200], [1, 2, 3, 4]);
    // 1st beats all 3 opponents → gains the most
    // 4th loses to all 3 → loses the most
    expect(results[0]!).toBeGreaterThan(1200); // 1st gains
    expect(results[3]!).toBeLessThan(1200);    // 4th loses
    // 2nd and 3rd should have smaller changes than 1st and 4th
    expect(Math.abs(results[1]! - 1200)).toBeLessThan(Math.abs(results[0]! - 1200));
    expect(Math.abs(results[2]! - 1200)).toBeLessThan(Math.abs(results[3]! - 1200));
  });

  it('tie: [1200, 1200] placements [1, 1] → both change by 0', () => {
    const [a, b] = updateElo([1200, 1200], [1, 1]);
    expect(a).toBe(1200);
    expect(b).toBe(1200);
  });

  it('zero-sum: sum of rating changes is approximately 0 for any match', () => {
    const ratings = [1200, 1400, 1000, 1300];
    const placements = [2, 1, 4, 3];
    const newRatings = updateElo(ratings, placements);
    const oldSum = ratings.reduce((s, r) => s + r, 0);
    const newSum = newRatings.reduce((s, r) => s + r, 0);
    // Due to rounding, might be off by up to ±n (number of players)
    expect(Math.abs(newSum - oldSum)).toBeLessThanOrEqual(ratings.length);
  });
});
