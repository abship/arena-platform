import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@arena/database';
import type {
  GeoLocation,
  GeoService,
  KYCService,
  Match,
  MatchId,
  MatchmakingService,
  Money,
  PaginatedResult,
  PaymentProvider,
  PlayerRating,
  Transaction,
  UserId,
  Wallet,
  WalletService,
} from '@arena/shared';
import { VerificationLevel as SharedVerificationLevel } from '@arena/shared';
import { vi } from 'vitest';
import { createApp } from '../app.js';
import type { AppDependencies } from '../types/app-dependencies.js';

export const TEST_JWT_SECRET = 'test-jwt-secret';
export const TEST_USER_ID = 'user-1' as UserId;
export const TEST_GAME_ID = 'game-1';

interface MockTransactionClient {
  readonly user: {
    readonly create: ReturnType<typeof vi.fn>;
  };
  readonly wallet: {
    readonly create: ReturnType<typeof vi.fn>;
  };
}

export interface MockPrismaClient {
  readonly client: PrismaClient;
  readonly transactionClient: MockTransactionClient;
  readonly user: {
    readonly findUnique: ReturnType<typeof vi.fn>;
  };
  readonly game: {
    readonly findMany: ReturnType<typeof vi.fn>;
    readonly findUnique: ReturnType<typeof vi.fn>;
  };
  readonly $transaction: ReturnType<typeof vi.fn>;
}

function createMockPrismaClient(): MockPrismaClient {
  const transactionClient: MockTransactionClient = {
    user: {
      create: vi.fn(),
    },
    wallet: {
      create: vi.fn(),
    },
  };

  const user = {
    findUnique: vi.fn(),
  };

  const game = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  };

  const $transaction = vi.fn(async (input: unknown) => {
    if (typeof input === 'function') {
      const callback = input as (tx: MockTransactionClient) => Promise<unknown>;
      return callback(transactionClient);
    }

    return input;
  });

  return {
    client: {
      user,
      game,
      $transaction,
    } as unknown as PrismaClient,
    transactionClient,
    user,
    game,
    $transaction,
  };
}

function createWalletServiceMock(): WalletService {
  return {
    deposit: vi.fn(),
    withdraw: vi.fn(),
    deductEntryFee: vi.fn(),
    awardPrize: vi.fn(),
    collectRake: vi.fn(),
    getBalance: vi.fn(async () => ({
      id: 'wallet-1',
      userId: TEST_USER_ID,
      balanceCents: 5_000 as Money,
      currency: 'USD',
      version: 2,
      createdAt: new Date('2026-04-12T00:00:00.000Z'),
    }) as Wallet),
    getTransactionHistory: vi.fn(async () => ({
      items: [],
      total: 0,
    }) as PaginatedResult<Transaction>),
  };
}

function createPaymentProviderMock(): PaymentProvider {
  return {
    processDeposit: vi.fn(async (_userId: UserId, amountCents: Money) => ({
      success: true,
      reference: 'deposit-ref-1',
      amountCents,
    })),
    processWithdrawal: vi.fn(),
    getDepositAddress: vi.fn(async () => 'fake-address'),
  };
}

function createKYCServiceMock(): KYCService {
  return {
    verifyIdentity: vi.fn(async () => ({
      success: true,
      level: SharedVerificationLevel.LEVEL_2,
      reason: null,
    })),
    checkAge: vi.fn(async () => true),
    getVerificationLevel: vi.fn(async () => SharedVerificationLevel.LEVEL_2),
  };
}

function createGeoServiceMock(): GeoService {
  const defaultLocation: GeoLocation = {
    countryCode: 'US' as GeoLocation['countryCode'],
    regionCode: 'CA' as NonNullable<GeoLocation['regionCode']>,
    latitude: 37.7749,
    longitude: -122.4194,
  };

  return {
    getLocation: vi.fn(async () => defaultLocation),
    checkJurisdiction: vi.fn(async () => true),
    getRules: vi.fn(async () => ({
      realMoneyEnabled: true,
      minAge: 18,
      allowedTiers: [1, 2],
      allowedPaymentMethods: ['crypto'] as const,
      requiresLicense: false,
    })),
  };
}

function createMatchmakingServiceMock(): MatchmakingService {
  return {
    joinQueue: vi.fn(async () => undefined),
    leaveQueue: vi.fn(async () => undefined),
    createMatch: vi.fn(async () => ({
      id: 'match-1',
      gameId: TEST_GAME_ID,
      status: 'IN_PROGRESS',
      entryFeeCents: 100 as Money,
      prizePoolCents: 184 as Money,
      rakeCents: 16 as Money,
      result: null,
      startedAt: new Date('2026-04-12T00:00:00.000Z'),
      endedAt: null,
    }) as Match),
    resolveMatch: vi.fn(async (matchId: MatchId) => ({
      id: matchId,
      gameId: TEST_GAME_ID as Match['gameId'],
      status: 'RESOLVED',
      entryFeeCents: 100 as Money,
      prizePoolCents: 184 as Money,
      rakeCents: 16 as Money,
      result: [
        {
          userId: TEST_USER_ID,
          position: 1,
          payoutCents: 184 as Money,
        },
      ],
      startedAt: new Date('2026-04-12T00:00:00.000Z'),
      endedAt: new Date('2026-04-12T00:10:00.000Z'),
    }) as unknown as Match),
    getRating: vi.fn(async (userId: UserId, gameId: string) => ({
      userId,
      gameId,
      elo: 1200,
    }) as PlayerRating),
  };
}

export interface TestContext {
  readonly app: ReturnType<typeof createApp>;
  readonly dependencies: AppDependencies;
  readonly prisma: MockPrismaClient;
  readonly walletService: WalletService;
  readonly paymentProvider: PaymentProvider;
  readonly kycService: KYCService;
  readonly geoService: GeoService;
  readonly matchmakingService: MatchmakingService;
}

/**
 * Build a test app with mocked dependencies and direct access to the mocks.
 *
 * @param overrides - Optional dependency overrides
 * @returns Test context with app and mocks
 */
export function createTestContext(
  overrides: Partial<AppDependencies> = {},
): TestContext {
  const prisma = createMockPrismaClient();
  const walletService = createWalletServiceMock();
  const paymentProvider = createPaymentProviderMock();
  const kycService = createKYCServiceMock();
  const geoService = createGeoServiceMock();
  const matchmakingService = createMatchmakingServiceMock();

  const dependencies: AppDependencies = {
    prisma: prisma.client,
    walletService,
    paymentProvider,
    kycService,
    geoService,
    matchmakingService,
    jwtSecret: TEST_JWT_SECRET,
    enableDevEndpoints: true,
    ...overrides,
  };

  return {
    app: createApp(dependencies),
    dependencies,
    prisma,
    walletService,
    paymentProvider,
    kycService,
    geoService,
    matchmakingService,
  };
}

/**
 * Sign a valid test JWT for the given user.
 *
 * @param userId - User ID to encode in the token
 * @returns A valid Bearer token payload
 */
export function signTestToken(userId: UserId = TEST_USER_ID): string {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Sign an already-expired test JWT for the given user.
 *
 * @param userId - User ID to encode in the token
 * @returns An expired JWT
 */
export function signExpiredTestToken(userId: UserId = TEST_USER_ID): string {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: -1 });
}

/**
 * Build an Authorization header value for test requests.
 *
 * @param userId - User ID to encode in the token
 * @returns A Bearer token header value
 */
export function authHeader(userId: UserId = TEST_USER_ID): string {
  return `Bearer ${signTestToken(userId)}`;
}
