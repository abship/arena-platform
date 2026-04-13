/**
 * Seed games, jurisdiction configs, and system wallets into the test database.
 * Mirrors packages/database/prisma/seed.ts — uses upserts for idempotency.
 */

import { prisma } from '@arena/database';
import {
  EngineClass,
  GameTier,
  MoneyModel,
} from '@prisma/client';

const SYSTEM_PASSWORD_HASH =
  '$2b$12$xejvjsLKoQG83ZdZYV.CFeSP7Uk7QRiXJRPSIL50Y/guGesKgAdgO';

type GameSeed = {
  readonly slug: string;
  readonly name: string;
  readonly tier: GameTier;
  readonly engineClass: EngineClass;
  readonly moneyModel: MoneyModel;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly entryFeeCents: bigint;
};

const TEN_CENTS = 10n;
const ONE_DOLLAR = 100n;
const FIVE_DOLLARS = 500n;
const TEN_DOLLARS = 1000n;

const GAMES: readonly GameSeed[] = [
  { slug: 'agario', name: 'Agar.io', tier: GameTier.TIER_2, engineClass: EngineClass.REAL_TIME_CONTINUOUS, moneyModel: MoneyModel.PROGRESSIVE_POOL, minPlayers: 2, maxPlayers: 50, entryFeeCents: TEN_CENTS },
  { slug: 'slitherio', name: 'Slither.io', tier: GameTier.TIER_2, engineClass: EngineClass.REAL_TIME_CONTINUOUS, moneyModel: MoneyModel.PROGRESSIVE_POOL, minPlayers: 2, maxPlayers: 50, entryFeeCents: TEN_CENTS },
  { slug: 'diep', name: 'Diep', tier: GameTier.TIER_2, engineClass: EngineClass.REAL_TIME_CONTINUOUS, moneyModel: MoneyModel.PROGRESSIVE_POOL, minPlayers: 2, maxPlayers: 50, entryFeeCents: TEN_CENTS },
  { slug: 'surviv', name: 'Surviv', tier: GameTier.TIER_2, engineClass: EngineClass.REAL_TIME_CONTINUOUS, moneyModel: MoneyModel.FIXED_POT, minPlayers: 50, maxPlayers: 100, entryFeeCents: TEN_CENTS },
  { slug: 'hole', name: 'Hole', tier: GameTier.TIER_2, engineClass: EngineClass.REAL_TIME_CONTINUOUS, moneyModel: MoneyModel.FIXED_POT, minPlayers: 10, maxPlayers: 20, entryFeeCents: TEN_CENTS },
  { slug: 'krunker', name: 'Krunker', tier: GameTier.TIER_1, engineClass: EngineClass.REAL_TIME_CONTINUOUS, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: TEN_DOLLARS },
  { slug: 'poker', name: 'Poker', tier: GameTier.TIER_2, engineClass: EngineClass.TURN_BASED, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 9, entryFeeCents: ONE_DOLLAR },
  { slug: 'blackjack', name: 'Blackjack', tier: GameTier.TIER_3, engineClass: EngineClass.TURN_BASED, moneyModel: MoneyModel.HOUSE_EDGE, minPlayers: 1, maxPlayers: 1, entryFeeCents: FIVE_DOLLARS },
  { slug: 'spades', name: 'Spades', tier: GameTier.TIER_2, engineClass: EngineClass.TURN_BASED, moneyModel: MoneyModel.FIXED_POT, minPlayers: 4, maxPlayers: 4, entryFeeCents: ONE_DOLLAR },
  { slug: 'rummy', name: 'Rummy', tier: GameTier.TIER_2, engineClass: EngineClass.TURN_BASED, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: ONE_DOLLAR },
  { slug: 'war', name: 'War', tier: GameTier.TIER_4, engineClass: EngineClass.TURN_BASED, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: FIVE_DOLLARS },
  { slug: 'skill-cards', name: 'Skill Cards', tier: GameTier.TIER_1, engineClass: EngineClass.TURN_BASED, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: ONE_DOLLAR },
  { slug: 'plinko', name: 'Plinko', tier: GameTier.TIER_4, engineClass: EngineClass.ALGORITHM, moneyModel: MoneyModel.HOUSE_EDGE, minPlayers: 1, maxPlayers: 1, entryFeeCents: FIVE_DOLLARS },
  { slug: 'crash', name: 'Crash', tier: GameTier.TIER_3, engineClass: EngineClass.ALGORITHM, moneyModel: MoneyModel.CRASH, minPlayers: 1, maxPlayers: 100, entryFeeCents: FIVE_DOLLARS },
  { slug: 'mines', name: 'Mines', tier: GameTier.TIER_3, engineClass: EngineClass.ALGORITHM, moneyModel: MoneyModel.HOUSE_EDGE, minPlayers: 1, maxPlayers: 1, entryFeeCents: FIVE_DOLLARS },
  { slug: 'dice', name: 'Dice', tier: GameTier.TIER_4, engineClass: EngineClass.ALGORITHM, moneyModel: MoneyModel.HOUSE_EDGE, minPlayers: 1, maxPlayers: 1, entryFeeCents: FIVE_DOLLARS },
  { slug: 'wheel', name: 'Wheel', tier: GameTier.TIER_4, engineClass: EngineClass.ALGORITHM, moneyModel: MoneyModel.HOUSE_EDGE, minPlayers: 1, maxPlayers: 1, entryFeeCents: FIVE_DOLLARS },
  { slug: 'coinflip', name: 'Coinflip', tier: GameTier.TIER_4, engineClass: EngineClass.ALGORITHM, moneyModel: MoneyModel.COINFLIP, minPlayers: 2, maxPlayers: 2, entryFeeCents: FIVE_DOLLARS },
  { slug: 'tetris-duel', name: 'Tetris Duel', tier: GameTier.TIER_1, engineClass: EngineClass.PARALLEL, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: ONE_DOLLAR },
  { slug: 'speed-math', name: 'Speed Math', tier: GameTier.TIER_1, engineClass: EngineClass.PARALLEL, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: ONE_DOLLAR },
  { slug: 'trivia', name: 'Trivia', tier: GameTier.TIER_1, engineClass: EngineClass.PARALLEL, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: ONE_DOLLAR },
  { slug: 'typing-race', name: 'Typing Race', tier: GameTier.TIER_1, engineClass: EngineClass.PARALLEL, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: ONE_DOLLAR },
  { slug: 'pattern-match', name: 'Pattern Match', tier: GameTier.TIER_1, engineClass: EngineClass.PARALLEL, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: ONE_DOLLAR },
  { slug: 'word-game', name: 'Word Game', tier: GameTier.TIER_1, engineClass: EngineClass.PARALLEL, moneyModel: MoneyModel.FIXED_POT, minPlayers: 2, maxPlayers: 2, entryFeeCents: ONE_DOLLAR },
];

type JurisdictionSeed = {
  readonly country: string;
  readonly region: string | null;
  readonly realMoneyEnabled: boolean;
  readonly minAge: number;
  readonly allowedTiers: number[];
  readonly allowedPaymentMethods: string[];
  readonly requiresLicense: boolean;
};

const JURISDICTIONS: readonly JurisdictionSeed[] = [
  { country: 'US', region: null, realMoneyEnabled: true, minAge: 18, allowedTiers: [1, 2], allowedPaymentMethods: ['crypto'], requiresLicense: false },
  { country: 'US', region: 'AZ', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'AR', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'CT', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'DE', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'IA', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'LA', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'MT', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'SC', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'SD', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'TN', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: 'US', region: 'VT', realMoneyEnabled: false, minAge: 18, allowedTiers: [], allowedPaymentMethods: [], requiresLicense: false },
  { country: '*', region: null, realMoneyEnabled: true, minAge: 18, allowedTiers: [1, 2, 3, 4], allowedPaymentMethods: ['crypto', 'stripe', 'paypal'], requiresLicense: true },
];

const SYSTEM_WALLET_USERS = [
  { id: 'SYSTEM_PLATFORM_SUSPENSE', email: 'system_platform_suspense@system.arena.gg', username: 'SYSTEM_PLATFORM_SUSPENSE' },
  { id: 'SYSTEM_MATCH_POOL', email: 'system_match_pool@system.arena.gg', username: 'SYSTEM_MATCH_POOL' },
  { id: 'SYSTEM_PLATFORM_REVENUE', email: 'system_platform_revenue@system.arena.gg', username: 'SYSTEM_PLATFORM_REVENUE' },
] as const;

/**
 * Seed the test database with games, jurisdiction configs, and system wallets.
 * Idempotent via upserts.
 */
export async function runSeed(): Promise<void> {
  // Seed games
  for (const game of GAMES) {
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: {
        name: game.name,
        tier: game.tier,
        engineClass: game.engineClass,
        moneyModel: game.moneyModel,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        entryFeeCents: game.entryFeeCents,
        isEnabled: true,
      },
      create: {
        slug: game.slug,
        name: game.name,
        tier: game.tier,
        engineClass: game.engineClass,
        moneyModel: game.moneyModel,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        entryFeeCents: game.entryFeeCents,
        isEnabled: true,
      },
    });
  }

  // Seed jurisdictions
  for (const j of JURISDICTIONS) {
    await prisma.jurisdictionConfig.upsert({
      // Prisma's compound unique type requires `string` for region even though the
      // column is nullable. The original seed (run via tsx) sidesteps this with
      // looser type checking. We cast here to match that behavior.
      where: { country_region: { country: j.country, region: j.region as string } },
      update: {
        realMoneyEnabled: j.realMoneyEnabled,
        minAge: j.minAge,
        allowedTiers: j.allowedTiers,
        allowedPaymentMethods: j.allowedPaymentMethods,
        requiresLicense: j.requiresLicense,
      },
      create: {
        country: j.country,
        region: j.region,
        realMoneyEnabled: j.realMoneyEnabled,
        minAge: j.minAge,
        allowedTiers: j.allowedTiers,
        allowedPaymentMethods: j.allowedPaymentMethods,
        requiresLicense: j.requiresLicense,
      },
    });
  }

  // Seed system wallets
  for (const su of SYSTEM_WALLET_USERS) {
    await prisma.user.upsert({
      where: { id: su.id },
      create: {
        id: su.id,
        email: su.email,
        passwordHash: SYSTEM_PASSWORD_HASH,
        username: su.username,
        country: 'SYSTEM',
      },
      update: {},
    });
    await prisma.wallet.upsert({
      where: { userId: su.id },
      create: { userId: su.id, balanceCents: 0n, currency: 'USD' },
      update: {},
    });
  }
}
