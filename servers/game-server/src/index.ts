// Engine base classes
export { BaseGameServer, type BaseInstanceState } from './engines/base-game-server.js';
export {
  RealTimeGameServerBase,
  type RealTimeInstanceState,
} from './engines/real-time-game-server.js';
export {
  TurnBasedGameServerBase,
  type TurnBasedInstanceState,
  type ActionRecord,
} from './engines/turn-based-game-server.js';
export {
  AlgorithmGameServerBase,
  type AlgorithmInstanceState,
} from './engines/algorithm-game-server.js';
export {
  ParallelGameServerBase,
  type ParallelInstanceState,
  type PlayerProgress,
} from './engines/parallel-game-server.js';

// Host and broadcaster
export { StateBroadcaster } from './host/broadcast.js';
export { GameInstanceHost } from './host/game-instance-host.js';
export type {
  GameFactory,
  GameServerInstance,
  UnsubscribeFn,
  StateListener,
  MatchEndListener,
  PlayerEventListener,
} from './host/types.js';

// Reference test games (for proving base classes work in tests)
export { ReferenceRealTimeGame } from './test-games/reference-real-time-game.js';
export { ReferenceTurnBasedGame } from './test-games/reference-turn-based-game.js';
export { ReferenceAlgorithmGame } from './test-games/reference-algorithm-game.js';
export { ReferenceParallelGame } from './test-games/reference-parallel-game.js';
