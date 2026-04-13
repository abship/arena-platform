/**
 * Vitest global setup — runs once before all test files.
 *
 * 1. Applies Prisma migrations to the ephemeral docker-compose Postgres.
 * 2. Seeds games, jurisdiction configs, and system wallets.
 */

import { runMigrations } from './migrate.js';
import { runSeed } from './seed.js';

export async function setup(): Promise<void> {
  console.log('[global-setup] Running Prisma migrations…');
  runMigrations();

  console.log('[global-setup] Seeding database…');
  await runSeed();

  console.log('[global-setup] Ready.');
}
