import { prisma } from '@arena/database';
import type { GameId } from '@arena/shared';
import { WalletServiceImpl } from '@arena/wallet';
import { createPaymentProvider } from '@arena/payments';
import { createKYCService } from '@arena/kyc';
import { createGeoService } from '@arena/geolocation';
import {
  BattleRoyaleTopThreeCalculator,
  CoinflipCalculator,
  type PayoutCalculator,
  WinnerTakesAllCalculator,
  createMatchmakingService,
} from '@arena/matchmaking';
import type { AppDependencies } from './types/app-dependencies.js';

interface RuntimeConfig {
  readonly port: number;
  readonly appDependencies: AppDependencies;
}

const WINNER_TAKES_ALL_GAME_SLUGS = [
  'poker',
  'spades',
  'rummy',
  'tetris-duel',
  'speed-math',
  'trivia',
  'typing-race',
  'pattern-match',
  'word-game',
  'skill-cards',
  'war',
] as const;

const BATTLE_ROYALE_GAME_SLUGS = ['surviv', 'hole'] as const;
const COINFLIP_GAME_SLUGS = ['coinflip'] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 3000;
  }

  const parsedPort = Number(value);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`PORT must be a positive integer. Received "${value}"`);
  }

  return parsedPort;
}

function parseEnableDevEndpoints(): boolean {
  const configuredValue = process.env['ENABLE_DEV_ENDPOINTS'];
  if (!configuredValue) {
    return process.env['NODE_ENV'] !== 'production';
  }

  return configuredValue.toLowerCase() === 'true';
}

async function buildCalculatorMap(): Promise<Map<GameId, PayoutCalculator>> {
  const games = await prisma.game.findMany({
    select: {
      id: true,
      slug: true,
    },
  });

  const gameIdBySlug = new Map(games.map((game) => [game.slug, game.id as GameId]));
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

  // Progressive-pool and house-edge games resolve through different code paths;
  // calculator map only covers fixed-pot games plus coinflip.
  return calculatorByGameId;
}

/**
 * Construct the real runtime dependency graph from environment configuration.
 *
 * @returns Runtime config containing the listening port and app dependencies
 */
export async function createServices(): Promise<RuntimeConfig> {
  requireEnv('DATABASE_URL');
  const jwtSecret = requireEnv('JWT_SECRET');

  const walletService = await WalletServiceImpl.create();
  const paymentProvider = createPaymentProvider({
    provider: process.env['PAYMENT_PROVIDER'] ?? 'fake',
    walletService,
  });
  const kycService = createKYCService({
    provider: process.env['KYC_PROVIDER'] ?? 'fake',
  });
  const geoService = createGeoService({
    provider: process.env['GEO_PROVIDER'] ?? 'fake',
  });
  const calculators = await buildCalculatorMap();
  const matchmakingService = createMatchmakingService({
    provider: process.env['MATCHMAKING_PROVIDER'] ?? 'in-memory',
    walletService,
    prisma,
    calculators,
  });

  return {
    port: parsePort(process.env['PORT']),
    appDependencies: {
      prisma,
      walletService,
      matchmakingService,
      paymentProvider,
      kycService,
      geoService,
      jwtSecret,
      enableDevEndpoints: parseEnableDevEndpoints(),
    },
  };
}
