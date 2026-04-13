import { describe, expect, it, vi } from 'vitest';
import type { MatchId } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { NotFoundError } from '@arena/shared';
import { StateBroadcaster } from '../host/broadcast.js';
import { ReferenceParallelGame } from '../test-games/reference-parallel-game.js';

const MATCH_ID = 'match-par-1' as MatchId;
const PLAYER_1 = 'user-1' as UserId;
const PLAYER_2 = 'user-2' as UserId;

describe('ParallelGameServerBase', () => {
  it('createInstance generates a challenge accessible via generateChallenge', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceParallelGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    const challenge = game.generateChallenge(MATCH_ID) as {
      numbers: number[];
      targetSum: number;
    };

    expect(challenge.numbers).toHaveLength(10);
    expect(challenge.targetSum).toBe(
      challenge.numbers.reduce((a, b) => a + b, 0),
    );
  });

  it('both players see the same challenge', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceParallelGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    const c1 = game.generateChallenge(MATCH_ID);
    const c2 = game.generateChallenge(MATCH_ID);

    expect(c1).toBe(c2); // Same reference — stored once
  });

  it('trackProgress updates player progress and broadcasts state', () => {
    const broadcaster = new StateBroadcaster();
    const stateListener = vi.fn();
    broadcaster.onState(stateListener);

    const game = new ReferenceParallelGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.trackProgress(MATCH_ID, PLAYER_1, { currentSum: 5 });

    expect(stateListener).toHaveBeenCalled();
  });

  it('match ends when all players finish, emitting match-end', () => {
    const broadcaster = new StateBroadcaster();
    const matchEndListener = vi.fn();
    broadcaster.onMatchEnd(matchEndListener);

    const game = new ReferenceParallelGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    const challenge = game.generateChallenge(MATCH_ID) as {
      targetSum: number;
    };

    game.trackProgress(MATCH_ID, PLAYER_1, { currentSum: challenge.targetSum });
    expect(matchEndListener).not.toHaveBeenCalled(); // Only one player finished

    game.trackProgress(MATCH_ID, PLAYER_2, { currentSum: challenge.targetSum });
    expect(matchEndListener).toHaveBeenCalledTimes(1);
  });

  it('compareResults orders by progress DESC then finishedAt ASC', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceParallelGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    const challenge = game.generateChallenge(MATCH_ID) as {
      targetSum: number;
    };

    // Player 1 finishes first
    game.trackProgress(MATCH_ID, PLAYER_1, { currentSum: challenge.targetSum });
    // Player 2 finishes second
    game.trackProgress(MATCH_ID, PLAYER_2, { currentSum: challenge.targetSum });

    const ranked = game.compareResults(MATCH_ID);
    expect(ranked[0]).toBe(PLAYER_1); // Finished first
    expect(ranked[1]).toBe(PLAYER_2);
  });

  it('compareResults ranks higher progress above lower progress', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceParallelGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    // Player 2 has higher progress
    game.trackProgress(MATCH_ID, PLAYER_1, { currentSum: 3 });
    game.trackProgress(MATCH_ID, PLAYER_2, { currentSum: 7 });

    const ranked = game.compareResults(MATCH_ID);
    expect(ranked[0]).toBe(PLAYER_2);
    expect(ranked[1]).toBe(PLAYER_1);
  });

  it('destroyInstance removes state', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceParallelGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.destroyInstance(MATCH_ID);

    expect(game.hasInstance(MATCH_ID)).toBe(false);
  });

  it('destroyInstance is idempotent', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceParallelGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.destroyInstance(MATCH_ID);
    game.destroyInstance(MATCH_ID); // should not throw
  });

  it('throws NotFoundError for operations on unknown matchId', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceParallelGame(broadcaster);
    const unknownId = 'unknown' as MatchId;

    expect(() => game.generateChallenge(unknownId)).toThrow(NotFoundError);
    expect(() => game.trackProgress(unknownId, PLAYER_1, {})).toThrow(NotFoundError);
    expect(() => game.compareResults(unknownId)).toThrow(NotFoundError);
  });
});
