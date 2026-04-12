import { describe, it, expect, vi } from 'vitest';
import type { WalletService, GameId } from '@arena/shared';
import type { PayoutCalculator } from '../payout-calculator.js';
import { createMatchmakingService } from '../matchmaking-service-factory.js';
import { InMemoryMatchmakingService } from '../matchmaking-service.js';

function makeConfig(provider?: string) {
  return {
    provider,
    walletService: {} as WalletService,
    prisma: {} as import('@prisma/client').PrismaClient,
    calculators: new Map<GameId, PayoutCalculator>(),
  };
}

describe('createMatchmakingService', () => {
  it('"in-memory" returns InMemoryMatchmakingService', () => {
    const service = createMatchmakingService(makeConfig('in-memory'));
    expect(service).toBeInstanceOf(InMemoryMatchmakingService);
  });

  it('default (no provider) returns InMemoryMatchmakingService', () => {
    const service = createMatchmakingService(makeConfig());
    expect(service).toBeInstanceOf(InMemoryMatchmakingService);
  });

  it('"redis" throws with guidance message', () => {
    expect(() => createMatchmakingService(makeConfig('redis'))).toThrow(
      /Redis-backed matchmaking deferred/,
    );
  });

  it('unknown provider throws with supported list', () => {
    expect(() => createMatchmakingService(makeConfig('kafka'))).toThrow(
      /Unknown matchmaking provider/,
    );
  });
});
