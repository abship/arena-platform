/**
 * Run `prisma migrate deploy` against the test DATABASE_URL.
 *
 * Uses `migrate deploy` (not `migrate dev`) — the safe, production-style
 * command that only applies committed migration files. Safe to run against
 * the ephemeral docker-compose Postgres.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const SCHEMA_PATH = resolve(
  import.meta.dirname,
  '../../../../packages/database/prisma/schema.prisma',
);

export function runMigrations(): void {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  execSync(
    `npx prisma migrate deploy --schema "${SCHEMA_PATH}"`,
    {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    },
  );
}
