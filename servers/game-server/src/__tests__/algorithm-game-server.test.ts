import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { MatchId } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { NotFoundError, ValidationError } from '@arena/shared';
import { StateBroadcaster } from '../host/broadcast.js';
import { ReferenceAlgorithmGame } from '../test-games/reference-algorithm-game.js';

const MATCH_ID = 'match-algo-1' as MatchId;
const PLAYER_1 = 'user-1' as UserId;
const PLAYER_2 = 'user-2' as UserId;

describe('AlgorithmGameServerBase', () => {
  it('commitSeed returns sha256 of the server seed, not the raw seed', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceAlgorithmGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    const hash = game.commitSeed(MATCH_ID);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // The hash is NOT the raw seed — verify it's a hash
    const rawSeed = game.generateOutcome(MATCH_ID, 'player-seed');
    const revealedSeed = game.revealSeed(MATCH_ID);
    const expectedHash = createHash('sha256').update(revealedSeed).digest('hex');
    expect(hash).toBe(expectedHash);
  });

  it('commitSeed is idempotent', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceAlgorithmGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    const hash1 = game.commitSeed(MATCH_ID);
    const hash2 = game.commitSeed(MATCH_ID);

    expect(hash1).toBe(hash2);
  });

  it('revealSeed throws if called before generateOutcome', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceAlgorithmGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    expect(() => game.revealSeed(MATCH_ID)).toThrow(ValidationError);
  });

  it('generateOutcome is deterministic given (serverSeed, playerSeed)', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceAlgorithmGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    const outcome1 = game.generateOutcome(MATCH_ID, 'player-seed-1');
    // Second call returns the same stored outcome (first-write-wins)
    const outcome2 = game.generateOutcome(MATCH_ID, 'different-seed');

    expect(outcome1).toEqual(outcome2);
  });

  it('player cannot influence outcome after commit (first-write-wins)', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceAlgorithmGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.commitSeed(MATCH_ID);
    const outcome1 = game.generateOutcome(MATCH_ID, 'seed-a');
    const outcome2 = game.generateOutcome(MATCH_ID, 'seed-b');

    expect(outcome1).toEqual(outcome2);
  });

  it('generateOutcome triggers match-end broadcast', () => {
    const broadcaster = new StateBroadcaster();
    const matchEndListener = vi.fn();
    broadcaster.onMatchEnd(matchEndListener);

    const game = new ReferenceAlgorithmGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.generateOutcome(MATCH_ID, 'player-seed');

    expect(matchEndListener).toHaveBeenCalledTimes(1);
    const state = game.getState(MATCH_ID) as { ended: boolean };
    expect(state.ended).toBe(true);
  });

  it('revealSeed returns the raw server seed after outcome', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceAlgorithmGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    const commitHash = game.commitSeed(MATCH_ID);
    game.generateOutcome(MATCH_ID, 'player-seed');
    const rawSeed = game.revealSeed(MATCH_ID);

    // Verify the seed hashes to the committed hash
    const verifyHash = createHash('sha256').update(rawSeed).digest('hex');
    expect(verifyHash).toBe(commitHash);
  });

  it('destroyInstance removes state', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceAlgorithmGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.destroyInstance(MATCH_ID);

    expect(game.hasInstance(MATCH_ID)).toBe(false);
  });

  it('throws NotFoundError for operations on unknown matchId', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceAlgorithmGame(broadcaster);
    const unknownId = 'unknown' as MatchId;

    expect(() => game.commitSeed(unknownId)).toThrow(NotFoundError);
    expect(() => game.generateOutcome(unknownId, 'seed')).toThrow(NotFoundError);
    expect(() => game.revealSeed(unknownId)).toThrow(NotFoundError);
  });
});
