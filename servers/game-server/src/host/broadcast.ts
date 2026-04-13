/**
 * Typed event broadcaster for game state updates.
 *
 * Wraps node:events EventEmitter with type-safe methods. Error isolation
 * ensures one bad listener cannot break broadcast to other subscribers.
 */

import { EventEmitter } from 'node:events';
import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import type {
  MatchEndListener,
  PlayerEventListener,
  StateListener,
  UnsubscribeFn,
} from './types.js';

const STATE_EVENT = 'state';
const MATCH_END_EVENT = 'match-end';
const PLAYER_JOINED_EVENT = 'player-joined';
const PLAYER_LEFT_EVENT = 'player-left';

export class StateBroadcaster {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  /** Broadcast a game state update for a match. */
  emitState(matchId: MatchId, state: unknown): void {
    this.safeEmit(STATE_EVENT, matchId, state);
  }

  /** Broadcast that a match has ended with a result. */
  emitMatchEnd(matchId: MatchId, result: MatchResult): void {
    this.safeEmit(MATCH_END_EVENT, matchId, result);
  }

  /** Broadcast that a player joined a match. */
  emitPlayerJoined(matchId: MatchId, userId: UserId): void {
    this.safeEmit(PLAYER_JOINED_EVENT, matchId, userId);
  }

  /** Broadcast that a player left a match. */
  emitPlayerLeft(matchId: MatchId, userId: UserId): void {
    this.safeEmit(PLAYER_LEFT_EVENT, matchId, userId);
  }

  /** Subscribe to state updates. Returns an unsubscribe function. */
  onState(listener: StateListener): UnsubscribeFn {
    this.emitter.on(STATE_EVENT, listener);
    return () => { this.emitter.off(STATE_EVENT, listener); };
  }

  /** Subscribe to match-end events. Returns an unsubscribe function. */
  onMatchEnd(listener: MatchEndListener): UnsubscribeFn {
    this.emitter.on(MATCH_END_EVENT, listener);
    return () => { this.emitter.off(MATCH_END_EVENT, listener); };
  }

  /** Subscribe to player-joined events. Returns an unsubscribe function. */
  onPlayerJoined(listener: PlayerEventListener): UnsubscribeFn {
    this.emitter.on(PLAYER_JOINED_EVENT, listener);
    return () => { this.emitter.off(PLAYER_JOINED_EVENT, listener); };
  }

  /** Subscribe to player-left events. Returns an unsubscribe function. */
  onPlayerLeft(listener: PlayerEventListener): UnsubscribeFn {
    this.emitter.on(PLAYER_LEFT_EVENT, listener);
    return () => { this.emitter.off(PLAYER_LEFT_EVENT, listener); };
  }

  /**
   * Emit an event with error isolation — if one listener throws,
   * other listeners still receive the event.
   */
  private safeEmit(event: string, ...args: unknown[]): void {
    const listeners = this.emitter.listeners(event);
    for (const listener of listeners) {
      try {
        (listener as (...a: unknown[]) => void)(...args);
      } catch (error) {
        console.error(JSON.stringify({
          action: 'broadcast.listener_error',
          event,
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    }
  }
}
