/**
 * Abstract base class for Engine Class C — Algorithm / Click-and-Resolve games.
 *
 * Provably fair RNG: server commits to a seed hash before the round,
 * combines with a player seed, reveals the server seed after for verification.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { AlgorithmGameServer } from '@arena/shared';
import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { ValidationError } from '@arena/shared';
import { BaseGameServer, type BaseInstanceState } from './base-game-server.js';
import type { StateBroadcaster } from '../host/broadcast.js';

/** Per-instance state for algorithm games. */
export interface AlgorithmInstanceState extends BaseInstanceState {
  readonly serverSeed: string;
  readonly serverSeedHash: string;
  playerSeed: string | null;
  revealed: boolean;
  outcome: unknown | null;
}

/**
 * Abstract base for provably fair algorithm game servers.
 * Subclasses interpret the combined hash as their specific outcome.
 */
export abstract class AlgorithmGameServerBase
  extends BaseGameServer
  implements AlgorithmGameServer
{
  constructor(broadcaster: StateBroadcaster) {
    super(broadcaster);
  }

  /**
   * Return the committed seed hash (published before the round).
   * Idempotent — returns the same hash on repeated calls.
   */
  commitSeed(matchId: MatchId): string {
    const state = this.requireInstance(matchId) as AlgorithmInstanceState;
    return state.serverSeedHash;
  }

  /**
   * Generate the outcome for a round.
   *
   * First call stores the player seed and computes the outcome.
   * Subsequent calls return the stored outcome (first-write-wins on player seed).
   */
  generateOutcome(matchId: MatchId, playerSeed: string): unknown {
    const state = this.requireInstance(matchId) as AlgorithmInstanceState;

    if (state.outcome !== null) {
      return state.outcome;
    }

    state.playerSeed = playerSeed;
    const combinedHash = sha256(`${state.serverSeed}:${playerSeed}`);
    const outcome = this.outcomeFromHash(combinedHash, state);

    state.outcome = outcome;
    state.ended = true;

    this.broadcastState(matchId);

    const result = this.buildMatchResult(matchId);
    this.broadcaster.emitMatchEnd(matchId, result);

    return outcome;
  }

  /**
   * Reveal the server seed AFTER outcome has been generated.
   * Throws if called before outcome exists (premature reveal breaks fairness proof).
   */
  revealSeed(matchId: MatchId): string {
    const state = this.requireInstance(matchId) as AlgorithmInstanceState;

    if (state.outcome === null) {
      throw new ValidationError(
        'Cannot reveal seed before outcome is generated',
        { matchId },
      );
    }

    state.revealed = true;
    return state.serverSeed;
  }

  /** Broadcast the current game state via the broadcaster. */
  protected broadcastState(matchId: MatchId): void {
    const state = this.getState(matchId);
    this.broadcaster.emitState(matchId, state);
  }

  /** Generate server seed and hash on instance creation. */
  protected override initInstanceState(
    matchId: MatchId,
    players: readonly UserId[],
  ): AlgorithmInstanceState {
    const serverSeed = randomBytes(32).toString('hex');
    const serverSeedHash = sha256(serverSeed);

    return {
      matchId,
      players,
      startedAt: new Date(),
      ended: false,
      serverSeed,
      serverSeedHash,
      playerSeed: null,
      revealed: false,
      outcome: null,
    };
  }

  /**
   * Subclass: interpret the combined hash as a game-specific outcome.
   * E.g. dice roll, crash multiplier, mine placements, etc.
   */
  protected abstract outcomeFromHash(
    hash: string,
    state: AlgorithmInstanceState,
  ): unknown;

  /**
   * Subclass: build the match result (placements) when the game ends.
   */
  protected abstract buildMatchResult(matchId: MatchId): MatchResult;
}

/** Compute SHA-256 hex digest. */
function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
