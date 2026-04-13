import { describe, expect, it, vi } from 'vitest';
import type { MatchId } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { NotFoundError, ValidationError } from '@arena/shared';
import { StateBroadcaster } from '../host/broadcast.js';
import { ReferenceTurnBasedGame } from '../test-games/reference-turn-based-game.js';

const MATCH_ID = 'match-tb-1' as MatchId;
const PLAYER_1 = 'user-1' as UserId;
const PLAYER_2 = 'user-2' as UserId;

describe('TurnBasedGameServerBase', () => {
  it('createInstance stores state with player 0 as current turn', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceTurnBasedGame(broadcaster);

    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    const state = game.getState(MATCH_ID) as { currentPlayerIndex: number; total: number };
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.total).toBe(0);
  });

  it('processAction applies action and advances turn', () => {
    const broadcaster = new StateBroadcaster();
    const stateListener = vi.fn();
    broadcaster.onState(stateListener);

    const game = new ReferenceTurnBasedGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.processAction(MATCH_ID, PLAYER_1, { increment: 1 });

    const state = game.getState(MATCH_ID) as { total: number; currentPlayerIndex: number };
    expect(state.total).toBe(1);
    expect(state.currentPlayerIndex).toBe(1);
    expect(stateListener).toHaveBeenCalled();
  });

  it('rejects actions from the wrong player', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceTurnBasedGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    expect(() => game.processAction(MATCH_ID, PLAYER_2, { increment: 1 }))
      .toThrow(ValidationError);
  });

  it('rejects illegal actions', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceTurnBasedGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    expect(() => game.processAction(MATCH_ID, PLAYER_1, { increment: 5 }))
      .toThrow(ValidationError);
  });

  it('checkWinCondition triggers match-end when total reaches target', () => {
    const broadcaster = new StateBroadcaster();
    const matchEndListener = vi.fn();
    broadcaster.onMatchEnd(matchEndListener);

    const game = new ReferenceTurnBasedGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    // Play 10 turns alternating
    for (let i = 0; i < 10; i++) {
      const currentPlayer = i % 2 === 0 ? PLAYER_1 : PLAYER_2;
      game.processAction(MATCH_ID, currentPlayer, { increment: 1 });
    }

    expect(matchEndListener).toHaveBeenCalledTimes(1);
    const state = game.getState(MATCH_ID) as { ended: boolean; winner: string };
    expect(state.ended).toBe(true);
    expect(state.winner).toBe(PLAYER_2); // Player 2 made the 10th move
  });

  it('rejects actions after match has ended', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceTurnBasedGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    for (let i = 0; i < 10; i++) {
      const currentPlayer = i % 2 === 0 ? PLAYER_1 : PLAYER_2;
      game.processAction(MATCH_ID, currentPlayer, { increment: 1 });
    }

    expect(() => game.processAction(MATCH_ID, PLAYER_1, { increment: 1 }))
      .toThrow(ValidationError);
  });

  it('turn wraps around correctly', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceTurnBasedGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.processAction(MATCH_ID, PLAYER_1, { increment: 1 });
    game.processAction(MATCH_ID, PLAYER_2, { increment: 1 });

    const state = game.getState(MATCH_ID) as { currentPlayerIndex: number };
    expect(state.currentPlayerIndex).toBe(0); // wraps back to player 1
  });

  it('destroyInstance removes state', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceTurnBasedGame(broadcaster);
    game.createInstance(MATCH_ID, [PLAYER_1, PLAYER_2]);

    game.destroyInstance(MATCH_ID);

    expect(game.hasInstance(MATCH_ID)).toBe(false);
    expect(() => game.getState(MATCH_ID)).toThrow(NotFoundError);
  });

  it('throws NotFoundError for operations on unknown matchId', () => {
    const broadcaster = new StateBroadcaster();
    const game = new ReferenceTurnBasedGame(broadcaster);
    const unknownId = 'unknown' as MatchId;

    expect(() => game.processAction(unknownId, PLAYER_1, { increment: 1 }))
      .toThrow(NotFoundError);
  });
});
