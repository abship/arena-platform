/**
 * ELO rating update utility for the Arena.gg platform.
 *
 * Uses K-factor 32 (standard). Supports multiplayer matches by computing
 * pairwise expected scores for each player pair.
 *
 * TODO: Refine to rating-band-aware K-factor when data justifies
 * (e.g. K=40 for players < 2100, K=20 for players 2100-2400, K=10 for 2400+).
 */

/** K-factor for ELO calculation. */
const K = 32;

/**
 * Compute updated ELO ratings after a match.
 *
 * @param ratings - Current ELO ratings for each player (parallel array)
 * @param placements - Finishing position for each player (1-indexed, lower is better; parallel array)
 * @returns New ELO ratings, rounded to nearest integer
 */
export function updateElo(
  ratings: readonly number[],
  placements: readonly number[],
): readonly number[] {
  const n = ratings.length;
  const newRatings: number[] = [];

  for (let i = 0; i < n; i++) {
    let delta = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;

      const expected = 1 / (1 + Math.pow(10, (ratings[j]! - ratings[i]!) / 400));

      let score: number;
      if (placements[i]! < placements[j]!) {
        score = 1;
      } else if (placements[i]! > placements[j]!) {
        score = 0;
      } else {
        score = 0.5;
      }

      delta += K * (score - expected);
    }

    newRatings.push(Math.round(ratings[i]! + delta));
  }

  return newRatings;
}
