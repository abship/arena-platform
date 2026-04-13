/**
 * Build the exact service graph that servers/api uses.
 *
 * Mirrors servers/api/src/services.ts but returns the raw services
 * without HTTP wiring, so integration tests call services directly.
 */

import { prisma } from '@arena/database';
import type { PrismaClient } from '@prisma/client';
import type { GameId, WalletService, MatchmakingService } from '@arena/shared';
import { WalletServiceImpl } from '@arena/wallet';
import { createPaymentProvider } from '@arena/payments';
import type { PaymentProvider } from '@arena/shared';
import { createKYCService } from '@arena/kyc';
import type { KYCService } from '@arena/shared';
import { createGeoService } from '@arena/geolocation';
import type { GeoService } from '@arena/shared';
import {
  BattleRoyaleTopThreeCalculator,
  CoinflipCalculator,
  type PayoutCalculator,
  WinnerTakesAllCalculator,
  createMatchmakingService,
} from '@arena/matchmaking';

const WINNER_TAKES_ALL_GAME_SLUGS = [
  'poker', 'spades', 'rummy', 'tetris-duel', 'speed-math',
  'trivia', 'typing-race', 'pattern-match', 'word-game', 'skill-cards', 'war',
] as const;

const BATTLE_ROYALE_GAME_SLUGS = ['surviv', 'hole'] as const;
const COINFLIP_GAME_SLUGS = ['coinflip'] as const;

export interface TestServices {
  readonly prisma: PrismaClient;
  readonly walletService: WalletService;
  readonly paymentProvider: PaymentProvider;
  readonly kycService: KYCService;
  readonly geoService: GeoService;
  readonly matchmakingService: MatchmakingService;
  readonly calculatorMap: Map<GameId, PayoutCalculator>;
}

async function buildCalculatorMap(): Promise<Map<GameId, PayoutCalculator>> {
  const games = await prisma.game.findMany({ select: { id: true, slug: true } });
  const gameIdBySlug = new Map(games.map((g) => [g.slug, g.id as GameId]));
  const calculatorByGameId = new Map<GameId, PayoutCalculator>();

  for (const slug of WINNER_TAKES_ALL_GAME_SLUGS) {
    const gameId = gameIdBySlug.get(slug);
    if (!gameId) {
      throw new Error(`Game slug "${slug}" not found while building calculator map`);
    }
    calculatorByGameId.set(gameId, new WinnerTakesAllCalculator());
  }

  for (const slug of BATTLE_ROYALE_GAME_SLUGS) {
    const gameId = gameIdBySlug.get(slug);
    if (!gameId) {
      throw new Error(`Game slug "${slug}" not found while building calculator map`);
    }
    calculatorByGameId.set(gameId, new BattleRoyaleTopThreeCalculator());
  }

  for (const slug of COINFLIP_GAME_SLUGS) {
    const gameId = gameIdBySlug.get(slug);
    if (!gameId) {
      throw new Error(`Game slug "${slug}" not found while building calculator map`);
    }
    calculatorByGameId.set(gameId, new CoinflipCalculator());
  }

  return calculatorByGameId;
}

/**
 * Build the full service graph using real factories and fake providers.
 * This is the single source of truth for "is the DI wiring correct."
 */
export async function buildServices(): Promise<TestServices> {
  const walletService = await WalletServiceImpl.create();

  const paymentProvider = createPaymentProvider({
    provider: 'fake',
    walletService,
  });

  const kycService = createKYCService({
    provider: 'fake',
  });

  const geoService = createGeoService({
    provider: 'fake',
  });

  const calculatorMap = await buildCalculatorMap();

  const matchmakingService = createMatchmakingService({
    provider: 'in-memory',
    walletService,
    prisma,
    calculators: calculatorMap,
  });

  return {
    prisma,
    walletService,
    paymentProvider,
    kycService,
    geoService,
    matchmakingService,
    calculatorMap,
  };
}
