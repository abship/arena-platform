import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { GameId, MatchId } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { NotFoundError } from '@arena/shared';
import { StateBroadcaster } from '../host/broadcast.js';
import { GameInstanceHost } from '../host/game-instance-host.js';
import { ReferenceRealTimeGame } from '../test-games/reference-real-time-game.js';
import { ReferenceTurnBasedGame } from '../test-games/reference-turn-based-game.js';

const GAME_RT = 'game-rt' as GameId;
const GAME_TB = 'game-tb' as GameId;
const MATCH_1 = 'match-host-1' as MatchId;
const MATCH_2 = 'match-host-2' as MatchId;
const PLAYER_1 = 'user-1' as UserId;
const PLAYER_2 = 'user-2' as UserId;

describe('GameInstanceHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createMatch creates an instance on the registered engine', () => {
    const broadcaster = new StateBroadcaster();
    const host = new GameInstanceHost(broadcaster);
    const rtGame = new ReferenceRealTimeGame(broadcaster);

    host.registerGame(GAME_RT, rtGame);
    host.createMatch(GAME_RT, MATCH_1, [PLAYER_1, PLAYER_2]);

    expect(rtGame.hasInstance(MATCH_1)).toBe(true);
  });

  it('createMatch emits player-joined for each player', () => {
    const broadcaster = new StateBroadcaster();
    const playerJoinedListener = vi.fn();
    broadcaster.onPlayerJoined(playerJoinedListener);

    const host = new GameInstanceHost(broadcaster);
    const tbGame = new ReferenceTurnBasedGame(broadcaster);
    host.registerGame(GAME_TB, tbGame);

    host.createMatch(GAME_TB, MATCH_1, [PLAYER_1, PLAYER_2]);

    expect(playerJoinedListener).toHaveBeenCalledTimes(2);
    expect(playerJoinedListener).toHaveBeenCalledWith(MATCH_1, PLAYER_1);
    expect(playerJoinedListener).toHaveBeenCalledWith(MATCH_1, PLAYER_2);
  });

  it('throws NotFoundError when creating a match for an unregistered game', () => {
    const broadcaster = new StateBroadcaster();
    const host = new GameInstanceHost(broadcaster);
    const unknownGameId = 'unknown-game' as GameId;

    expect(() => host.createMatch(unknownGameId, MATCH_1, [PLAYER_1]))
      .toThrow(NotFoundError);
  });

  it('handleInput routes to the correct engine based on matchId', () => {
    const broadcaster = new StateBroadcaster();
    const host = new GameInstanceHost(broadcaster);
    const tbGame = new ReferenceTurnBasedGame(broadcaster);
    host.registerGame(GAME_TB, tbGame);
    host.createMatch(GAME_TB, MATCH_1, [PLAYER_1, PLAYER_2]);

    // Turn-based game accepts processAction via onPlayerInput — base just validates instance
    // The default onPlayerInput in base just checks instance exists
    expect(() => host.handleInput(MATCH_1, PLAYER_1, { increment: 1 })).not.toThrow();
  });

  it('handleInput throws NotFoundError for unknown matchId', () => {
    const broadcaster = new StateBroadcaster();
    const host = new GameInstanceHost(broadcaster);
    const unknownMatch = 'unknown-match' as MatchId;

    expect(() => host.handleInput(unknownMatch, PLAYER_1, {}))
      .toThrow(NotFoundError);
  });

  it('handlePlayerLeave routes to the correct engine', () => {
    const broadcaster = new StateBroadcaster();
    const playerLeftListener = vi.fn();
    broadcaster.onPlayerLeft(playerLeftListener);

    const host = new GameInstanceHost(broadcaster);
    const tbGame = new ReferenceTurnBasedGame(broadcaster);
    host.registerGame(GAME_TB, tbGame);
    host.createMatch(GAME_TB, MATCH_1, [PLAYER_1, PLAYER_2]);

    host.handlePlayerLeave(MATCH_1, PLAYER_1);

    expect(playerLeftListener).toHaveBeenCalledWith(MATCH_1, PLAYER_1);
  });

  it('getState routes to the correct engine', () => {
    const broadcaster = new StateBroadcaster();
    const host = new GameInstanceHost(broadcaster);
    const tbGame = new ReferenceTurnBasedGame(broadcaster);
    host.registerGame(GAME_TB, tbGame);
    host.createMatch(GAME_TB, MATCH_1, [PLAYER_1, PLAYER_2]);

    const state = host.getState(MATCH_1) as { total: number };

    expect(state.total).toBe(0);
  });

  it('destroyMatch cleans up both matchId→gameId map and engine instance', () => {
    const broadcaster = new StateBroadcaster();
    const host = new GameInstanceHost(broadcaster);
    const rtGame = new ReferenceRealTimeGame(broadcaster);
    host.registerGame(GAME_RT, rtGame);
    host.createMatch(GAME_RT, MATCH_1, [PLAYER_1]);

    host.destroyMatch(MATCH_1);

    expect(rtGame.hasInstance(MATCH_1)).toBe(false);
    expect(() => host.getState(MATCH_1)).toThrow(NotFoundError);
  });

  it('destroyMatch is idempotent for unknown matchIds', () => {
    const broadcaster = new StateBroadcaster();
    const host = new GameInstanceHost(broadcaster);

    expect(() => host.destroyMatch('nonexistent' as MatchId)).not.toThrow();
  });

  it('runs matches for different game types simultaneously without cross-talk', () => {
    const broadcaster = new StateBroadcaster();
    const host = new GameInstanceHost(broadcaster);
    const rtGame = new ReferenceRealTimeGame(broadcaster);
    const tbGame = new ReferenceTurnBasedGame(broadcaster);

    host.registerGame(GAME_RT, rtGame);
    host.registerGame(GAME_TB, tbGame);

    host.createMatch(GAME_RT, MATCH_1, [PLAYER_1, PLAYER_2]);
    host.createMatch(GAME_TB, MATCH_2, [PLAYER_1, PLAYER_2]);

    // Advance real-time ticks
    vi.advanceTimersByTime(50 * 3);

    const rtState = host.getState(MATCH_1) as { counter: number };
    const tbState = host.getState(MATCH_2) as { total: number };

    expect(rtState.counter).toBe(3);
    expect(tbState.total).toBe(0); // Turn-based hasn't been played

    // Clean up
    host.destroyMatch(MATCH_1);
    host.destroyMatch(MATCH_2);
  });
});
