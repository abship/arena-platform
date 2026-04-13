# Integration Tests

Phase 1 end-to-end integration tests against a real Postgres database.

## Prerequisites

- **Docker** must be running on the dev machine
- All packages must be built (`npx turbo build` at repo root)

## Usage

From the repo root:

```bash
npm run test:integration
```

This command:

1. Starts a Postgres 16 container on port 5433 via docker-compose
2. Runs `prisma migrate deploy` to apply migrations
3. Seeds games, jurisdiction configs, and system wallets
4. Executes the integration test suite
5. Tears down the container (with volume removal)

## What's Tested

Three tests covering the minimum-playable flow:

1. **Happy path**: signup → deposit → queue → match creation → resolution → payout (tetris-duel, WinnerTakesAll). Verifies wallet balances, match state, MatchPlayer rows, rake transaction, double-entry ledger invariant, and ELO rating updates.

2. **Idempotency**: calling `resolveMatch` twice with identical arguments does not double-pay prizes or rake. Validates wallet idempotency keys work end-to-end.

3. **Test isolation**: after a full flow, `prismaReset()` restores the database to a clean-seeded state. Proves tests don't contaminate each other.

## Architecture

- `infrastructure/docker/docker-compose.test.yml` — ephemeral Postgres on port 5433 with tmpfs data dir
- `tests/integration/src/setup/` — migration runner, seed, reset, service graph builder
- `tests/integration/src/helpers/` — signup helper, game ID resolver
- `tests/integration/src/__tests__/` — test files

The service graph is built using the same real factories from each package (not mocks). This is the single source of truth for "is the DI wiring correct."

## Notes

- Port 5433 avoids collision with any local Postgres on 5432
- `tmpfs` data dir guarantees instant teardown and clean state
- Only `prisma migrate deploy` is used (never `migrate dev`)
- Tests run serialized via vitest `singleFork` mode (shared DB)
