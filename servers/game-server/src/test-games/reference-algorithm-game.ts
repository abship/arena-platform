/**
 * TEST REFERENCE — NOT A REAL GAME.
 *
 * Minimal algorithm game for proving AlgorithmGameServerBase works.
 * Deterministic coin flip: hash of (serverSeed + playerSeed) mod 2.
 * 0 = first player wins, 1 = second player wins.
 */

import type { MatchId, MatchResult } from '@arena/shared';
import type { Money } from '@arena/shared';
import {
  AlgorithmGameServerBase,
  type AlgorithmInstanceState,
} from '../engines/algorithm-game-server.js';

export class ReferenceAlgorithmGame extends AlgorithmGameServerBase {
  protected outcomeFromHash(
    hash: string,
    _state: AlgorithmInstanceState,
  ): unknown {
    const value = parseInt(hash.slice(0, 8), 16) % 2;
    return { winnerIndex: value };
  }

  protected buildMatchResult(matchId: MatchId): MatchResult {
    const state = this.requireInstance(matchId) as AlgorithmInstanceState;
    const outcome = state.outcome as { winnerIndex: number };

    return state.players.map((userId, index) => ({
      userId,
      position: index === outcome.winnerIndex ? 1 : 2,
      payoutCents: 0 as Money,
    }));
  }
}
