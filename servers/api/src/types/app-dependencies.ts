import type { PrismaClient } from '@arena/database';
import type {
  GeoService,
  KYCService,
  MatchmakingService,
  PaymentProvider,
  WalletService,
} from '@arena/shared';

/** Runtime dependencies injected into the Express application. */
export interface AppDependencies {
  readonly prisma: PrismaClient;
  readonly walletService: WalletService;
  readonly matchmakingService: MatchmakingService;
  readonly paymentProvider: PaymentProvider;
  readonly kycService: KYCService;
  readonly geoService: GeoService;
  readonly jwtSecret: string;
  readonly enableDevEndpoints: boolean;
}
