import { describe, expect, it, vi } from 'vitest';
import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId, Money } from '@arena/shared';
import { StateBroadcaster } from '../host/broadcast.js';

const MATCH_ID = 'match-1' as MatchId;
const USER_ID = 'user-1' as UserId;

describe('StateBroadcaster', () => {
  it('delivers state events to subscribers', () => {
    const broadcaster = new StateBroadcaster();
    const listener = vi.fn();

    broadcaster.onState(listener);
    broadcaster.emitState(MATCH_ID, { counter: 5 });

    expect(listener).toHaveBeenCalledWith(MATCH_ID, { counter: 5 });
  });

  it('delivers match-end events to subscribers', () => {
    const broadcaster = new StateBroadcaster();
    const listener = vi.fn();
    const result: MatchResult = [
      { userId: USER_ID, position: 1, payoutCents: 0 as Money },
    ];

    broadcaster.onMatchEnd(listener);
    broadcaster.emitMatchEnd(MATCH_ID, result);

    expect(listener).toHaveBeenCalledWith(MATCH_ID, result);
  });

  it('delivers player-joined events', () => {
    const broadcaster = new StateBroadcaster();
    const listener = vi.fn();

    broadcaster.onPlayerJoined(listener);
    broadcaster.emitPlayerJoined(MATCH_ID, USER_ID);

    expect(listener).toHaveBeenCalledWith(MATCH_ID, USER_ID);
  });

  it('delivers player-left events', () => {
    const broadcaster = new StateBroadcaster();
    const listener = vi.fn();

    broadcaster.onPlayerLeft(listener);
    broadcaster.emitPlayerLeft(MATCH_ID, USER_ID);

    expect(listener).toHaveBeenCalledWith(MATCH_ID, USER_ID);
  });

  it('unsubscribe removes the listener', () => {
    const broadcaster = new StateBroadcaster();
    const listener = vi.fn();

    const unsub = broadcaster.onState(listener);
    unsub();
    broadcaster.emitState(MATCH_ID, { counter: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('one listener throwing does not prevent others from receiving the event', () => {
    const broadcaster = new StateBroadcaster();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badListener = vi.fn(() => { throw new Error('boom'); });
    const goodListener = vi.fn();

    broadcaster.onState(badListener);
    broadcaster.onState(goodListener);
    broadcaster.emitState(MATCH_ID, { counter: 1 });

    expect(badListener).toHaveBeenCalled();
    expect(goodListener).toHaveBeenCalledWith(MATCH_ID, { counter: 1 });
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('supports multiple subscribers on different events', () => {
    const broadcaster = new StateBroadcaster();
    const stateListener = vi.fn();
    const endListener = vi.fn();

    broadcaster.onState(stateListener);
    broadcaster.onMatchEnd(endListener);

    broadcaster.emitState(MATCH_ID, { counter: 1 });

    expect(stateListener).toHaveBeenCalledTimes(1);
    expect(endListener).not.toHaveBeenCalled();
  });
});
