/**
 * Factory for creating matchmaking service instances.
 *
 * Gated on MATCHMAKING_PROVIDER env var:
 * - "in-memory" (default): InMemoryMatchmakingService with in-memory queue
 * - "redis": Deferred — throws with guidance to queue.ts swap point
 *
 * The Redis swap point is packages/matchmaking/src/queue.ts.
 * In-memory queue is sufficient for Phase 1 through beta.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  WalletService,
  MatchmakingService,
  GameId,
} from '@arena/shared';
import type { PayoutCalculator } from './payout-calculator.js';
import { InMemoryMatchmakingService } from './matchmaking-service.js';
import { MatchQueue } from './queue.js';

/** Configuration for creating a matchmaking service. */
export interface MatchmakingServiceConfig {
  /** Provider type. Defaults to "in-memory". */
  provider?: string;
  /** Wallet service instance for fee/prize operations. */
  walletService: WalletService;
  /** Prisma client for persistence. */
  prisma: PrismaClient;
  /** Map of game IDs to payout calculators. */
  calculators: Map<GameId, PayoutCalculator>;
  /** Optional custom queue instance. */
  queue?: MatchQueue;
}

/**
 * Create a matchmaking service instance based on provider configuration.
 *
 * @param config - Service configuration
 * @returns A MatchmakingService implementation
 * @throws Error for unsupported providers
 */
export function createMatchmakingService(
  config: MatchmakingServiceConfig,
): MatchmakingService {
  const provider = config.provider ?? process.env.MATCHMAKING_PROVIDER ?? 'in-memory';

  switch (provider) {
    case 'in-memory':
      return new InMemoryMatchmakingService(
        config.walletService,
        config.prisma,
        config.calculators,
        config.queue,
      );

    case 'redis':
      throw new Error(
        'Redis-backed matchmaking deferred; queue swap point is packages/matchmaking/src/queue.ts. ' +
        'In-memory queue is sufficient for Phase 1 through beta.',
      );

    default:
      throw new Error(
        `Unknown matchmaking provider "${provider}". Supported: "in-memory". ` +
        'Redis support deferred to post-beta.',
      );
  }
}
