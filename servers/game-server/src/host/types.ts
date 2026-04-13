/**
 * Internal types for the game instance host and broadcaster.
 */

import type { MatchId, MatchResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import type { BaseGameServer } from '../engines/base-game-server.js';

/** A function that creates a game server instance for a specific game. */
export type GameFactory = () => BaseGameServer;

/** A registered game server that the host manages instances on. */
export interface GameServerInstance {
  readonly gameServer: BaseGameServer;
}

/** Callback for unsubscribing from broadcast events. */
export type UnsubscribeFn = () => void;

/** Listener for state broadcast events. */
export type StateListener = (matchId: MatchId, state: unknown) => void;

/** Listener for match-end events. */
export type MatchEndListener = (matchId: MatchId, result: MatchResult) => void;

/** Listener for player join/leave events. */
export type PlayerEventListener = (matchId: MatchId, userId: UserId) => void;
