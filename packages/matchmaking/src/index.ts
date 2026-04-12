export { InMemoryMatchmakingService } from './matchmaking-service.js';
export { computeRake } from './rake.js';
export { updateElo } from './elo.js';
export { MatchQueue } from './queue.js';
export {
  type PayoutCalculator,
  WinnerTakesAllCalculator,
  BattleRoyaleTopThreeCalculator,
  CoinflipCalculator,
  DEFAULT_CALCULATORS,
} from './payout-calculator.js';
export { createMatchmakingService } from './matchmaking-service-factory.js';
export type { MatchmakingServiceConfig } from './matchmaking-service-factory.js';
