import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { MatchId } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { NotFoundError } from '@arena/shared';
import { StateBroadcaster } from '../host/broadcast.js';
import { ReferenceRealTimeGame } from '../test-games/reference-real-time-game.js';

const MATCH_ID = 'match-rt-1' as MatchId;
const MATCH_ID_2 = 'match-rt-2' as MatchId;
const PLAYER_1 = 'user-1' as UserId;
const PLAYER_2 = 'user-2' as UserId;

describe('RealTimeGameServerBase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createInstance stores state and starts the tick loop', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceRealTimeGame(broadcaster);

    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    expect(game.hasInstance(MATCH_ID)).toBe(true);
    const state = game.getState(MATCH_ID) as { counter: number };
    expect(state.counter).toBe(0);
  });

  it('tick loop advances counter and broadcasts state', () => {
    const broadcaster = new StateBroadcaster();
    const stateListener = vi.fn();
    broadcaster.onState(stateListener);

    const game = new ReferenceRealTimeGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    // Advance one tick (20hz = 50ms interval)
    vi.advanceTimersByTime(50);

    const state = game.getState(MATCH_ID) as { counter: number };
    expect(state.counter).toBe(1);
    expect(stateListener).toHaveBeenCalled();
  });

  it('checkWinCondition triggers match-end broadcast and stops tick loop', () => {
    const broadcaster = new StateBroadcaster();
    const matchEndListener = vi.fn();
    broadcaster.onMatchEnd(matchEndListener);

    const game = new ReferenceRealTimeGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    // Advance 10 ticks to reach win target
    vi.advanceTimersByTime(50 * 10);

    expect(matchEndListener).toHaveBeenCalledTimes(1);
    const [endMatchId, result] = matchEndListener.mock.calls[0] as [MatchId, unknown];
    expect(endMatchId).toBe(MATCH_ID);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: PLAYER_1, position: 1 }),
    ]));

    // Further ticks should not increment (loop stopped)
    const stateBefore = game.getState(MATCH_ID) as { counter: number };
    vi.advanceTimersByTime(50 * 5);
    const stateAfter = game.getState(MATCH_ID) as { counter: number };
    expect(stateAfter.counter).toBe(stateBefore.counter);
  });

  it('destroyInstance stops the tick loop and removes state', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceRealTimeGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.destroyInstance(MATCH_ID);

    expect(game.hasInstance(MATCH_ID)).toBe(false);
    expect(() => game.getState(MATCH_ID)).toThrow(NotFoundError);
  });

  it('destroyInstance is idempotent', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceRealTimeGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.destroyInstance(MATCH_ID);
    game.destroyInstance(MATCH_ID); // should not throw
  });

  it('multiple matches run simultaneously without state cross-contamination', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceRealTimeGame(broadcaster);

    game.createInstance(MATCH_ID, [PLAYER_1]);
    game.createInstance(MATCH_ID_2, [PLAYER_2]);

    // Advance 3 ticks
    vi.advanceTimersByTime(50 * 3);

    const state1 = game.getState(MATCH_ID) as { counter: number };
    const state2 = game.getState(MATCH_ID_2) as { counter: number };
    expect(state1.counter).toBe(3);
    expect(state2.counter).toBe(3);

    // Destroy one, the other keeps running
    game.destroyInstance(MATCH_ID);
    vi.advanceTimersByTime(50 * 2);

    const state2After = game.getState(MATCH_ID_2) as { counter: number };
    expect(state2After.counter).toBe(5);
    expect(game.hasInstance(MATCH_ID)).toBe(false);

    game.destroyInstance(MATCH_ID_2);
  });

  it('throws NotFoundError for operations on unknown matchId', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceRealTimeGame(broadcaster);
    const unknownId = 'unknown' as MatchId;

    expect(() => game.getState(unknownId)).toThrow(NotFoundError);
    expect(() => game.onTick(unknownId, 50)).toThrow(NotFoundError);
    expect(() => game.checkWinCondition(unknownId)).toThrow(NotFoundError);
  });
});
