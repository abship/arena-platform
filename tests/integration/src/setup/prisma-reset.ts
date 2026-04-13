/**
 * Truncate all user-data tables and re-seed.
 *
 * Uses TRUNCATE … CASCADE so FK ordering doesn't matter.
 * Does NOT drop tables — migrations already ran in global setup.
 * System wallets and seed data are restored by runSeed().
 */

import { prisma } from '@arena/database';
import { runSeed } from './seed.js';

/** Tables to truncate (user-data only — games and jurisdiction_configs are re-seeded). */
const TABLES_TO_TRUNCATE = [
  'ledger_entries',
  'transactions',
  'match_players',
  'matches',
  'wallets',
  'users',
  'games',
  'jurisdiction_configs',
] as const;

/**
 * Reset the test database to a clean-seeded state.
 * Call this in beforeEach to ensure test isolation.
 */
export async function prismaReset(): Promise<void> {
  // Truncate all tables in one statement with CASCADE
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES_TO_TRUNCATE.join(', ')} CASCADE`,
  );

  // Re-seed reference data and system wallets
  await runSeed();
}
