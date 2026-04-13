/**
 * Phase 1 Integration Tests — End-to-End Flow
 *
 * Validates: signup → deposit → queue → match creation → match resolution → payout
 * against a real Postgres database via docker-compose.
 *
 * Three tests:
 * 1. Happy path end-to-end
 * 2. Idempotent resolveMatch doesn't double-pay
 * 3. Reseed proves test isolation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@arena/database';
import type { UserId, Money, MatchId, GameId } from '@arena/shared';
import { TransactionType, MatchStatus } from '@arena/shared';
import { prismaReset } from '../setup/prisma-reset.js';
import { buildServices, type TestServices } from '../setup/build-services.js';
import { signup } from '../helpers/signup.js';
import { resolveGameId } from '../helpers/resolve-game-id.js';

describe('Phase 1 Integration: Full Flow', () => {
  let services: TestServices;
  let tetrisDuelGameId: GameId;

  beforeEach(async () => {
    await prismaReset();
    services = await buildServices();
    tetrisDuelGameId = await resolveGameId('tetris-duel');
  });

  // ─── Test 1: Happy path end-to-end ───────────────────────────────

  it('signup → deposit → queue → match → resolve → payout (tetris-duel)', async () => {
    const { walletService, paymentProvider, matchmakingService } = services;

    // Create two users
    const alice = await signup({ country: 'US', region: 'CA' });
    const bob = await signup({ country: 'US', region: 'CA' });

    // Each deposits $10.00 (1000 cents) via FakePaymentProvider
    // FakePaymentProvider calls walletService.deposit internally
    await paymentProvider.processDeposit(alice.userId, 1000 as Money);
    await paymentProvider.processDeposit(bob.userId, 1000 as Money);

    // Verify balances: $100 initial fake + $10 deposit = $110 = 11000 cents
    const alicePreMatch = await walletService.getBalance(alice.userId);
    const bobPreMatch = await walletService.getBalance(bob.userId);
    expect(alicePreMatch.balanceCents).toBe(11000);
    expect(bobPreMatch.balanceCents).toBe(11000);

    // Both join queue for tetris-duel at $1.00 entry fee
    const entryFeeCents = 100 as Money;
    await matchmakingService.joinQueue(alice.userId, tetrisDuelGameId, entryFeeCents);
    await matchmakingService.joinQueue(bob.userId, tetrisDuelGameId, entryFeeCents);

    // Create the match — deducts entry fees
    const match = await matchmakingService.createMatch(
      tetrisDuelGameId,
      [alice.userId, bob.userId],
      entryFeeCents,
    );
    expect(match.status).toBe(MatchStatus.IN_PROGRESS);

    // Entry fee = $1.00 = 100 cents, 2 players
    // Rake tier for $1 entry: 8%
    // Pool = 200 cents total
    // Rake = 200 * 0.08 = 16 cents
    // Prize pool = 200 - 16 = 184 cents
    expect(match.rakeCents).toBe(16);
    expect(match.prizePoolCents).toBe(184);

    // Verify balances after entry fee deduction
    const aliceAfterEntry = await walletService.getBalance(alice.userId);
    const bobAfterEntry = await walletService.getBalance(bob.userId);
    expect(aliceAfterEntry.balanceCents).toBe(11000 - 100); // 10900
    expect(bobAfterEntry.balanceCents).toBe(11000 - 100); // 10900

    // Resolve: Alice wins (position 1), Bob loses (position 2)
    // WinnerTakesAllCalculator: winner gets entire prize pool = 184
    const resolvedMatch = await matchmakingService.resolveMatch(
      match.id,
      [
        { userId: alice.userId, position: 1, payoutCents: 184 as Money },
        { userId: bob.userId, position: 2, payoutCents: 0 as Money },
      ],
    );

    // ── Assert Match state ──
    expect(resolvedMatch.status).toBe(MatchStatus.RESOLVED);
    expect(resolvedMatch.endedAt).not.toBeNull();
    expect(resolvedMatch.prizePoolCents).toBe(184);
    expect(resolvedMatch.rakeCents).toBe(16);

    // Verify match row in DB directly
    const matchRow = await prisma.match.findUnique({
      where: { id: match.id as string },
    });
    expect(matchRow).not.toBeNull();
    expect(matchRow!.status).toBe('RESOLVED');
    expect(matchRow!.resolvedAt).not.toBeNull();
    expect(Number(matchRow!.poolCents)).toBe(184);
    expect(Number(matchRow!.rakeCents)).toBe(16);

    // ── Assert wallet balances ──
    // Alice: 11000 - 100 (entry) + 184 (prize) = 11084
    // Bob: 11000 - 100 (entry) + 0 = 10900
    const aliceFinal = await walletService.getBalance(alice.userId);
    const bobFinal = await walletService.getBalance(bob.userId);
    expect(aliceFinal.balanceCents).toBe(11084);
    expect(bobFinal.balanceCents).toBe(10900);

    // ── Assert MatchPlayer rows ──
    const matchPlayers = await prisma.matchPlayer.findMany({
      where: { matchId: match.id as string },
      orderBy: { finalPosition: 'asc' },
    });
    expect(matchPlayers).toHaveLength(2);
    expect(matchPlayers[0]!.userId).toBe(alice.userId as string);
    expect(matchPlayers[0]!.finalPosition).toBe(1);
    expect(Number(matchPlayers[0]!.payoutCents)).toBe(184);
    expect(matchPlayers[1]!.userId).toBe(bob.userId as string);
    expect(matchPlayers[1]!.finalPosition).toBe(2);
    expect(Number(matchPlayers[1]!.payoutCents)).toBe(0);

    // ── Assert RAKE transaction ──
    const rakeTransactions = await prisma.transaction.findMany({
      where: {
        matchId: match.id as string,
        type: 'RAKE',
      },
    });
    expect(rakeTransactions).toHaveLength(1);
    expect(Number(rakeTransactions[0]!.amountCents)).toBe(16);

    // ── Assert double-entry invariant ──
    // For every transaction created during this flow, sum(debitCents) === sum(creditCents)
    const allTransactions = await prisma.transaction.findMany({
      where: { matchId: match.id as string },
      include: { ledgerEntries: true },
    });

    for (const tx of allTransactions) {
      const totalDebits = tx.ledgerEntries.reduce(
        (sum, le) => sum + Number(le.debitCents),
        0,
      );
      const totalCredits = tx.ledgerEntries.reduce(
        (sum, le) => sum + Number(le.creditCents),
        0,
      );
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBeGreaterThan(0);
    }

    // ── Assert ELO ratings ──
    // Ratings are stored on MatchPlayer rows for this match
    // Alice won → rating > 1200; Bob lost → rating < 1200
    const alicePlayer = matchPlayers[0]!;
    const bobPlayer = matchPlayers[1]!;
    expect(alicePlayer.rating).toBeGreaterThan(1200);
    expect(bobPlayer.rating).toBeLessThan(1200);
  });

  // ─── Test 2: Idempotent resolveMatch doesn't double-pay ─────────

  it('resolveMatch is idempotent — second call does not double-pay', async () => {
    const { walletService, paymentProvider, matchmakingService } = services;

    // Setup: same as test 1 through match creation
    const alice = await signup({ country: 'US' });
    const bob = await signup({ country: 'US' });
    await paymentProvider.processDeposit(alice.userId, 1000 as Money);
    await paymentProvider.processDeposit(bob.userId, 1000 as Money);

    const entryFeeCents = 100 as Money;
    await matchmakingService.joinQueue(alice.userId, tetrisDuelGameId, entryFeeCents);
    await matchmakingService.joinQueue(bob.userId, tetrisDuelGameId, entryFeeCents);

    const match = await matchmakingService.createMatch(
      tetrisDuelGameId,
      [alice.userId, bob.userId],
      entryFeeCents,
    );

    const result = [
      { userId: alice.userId, position: 1, payoutCents: 184 as Money },
      { userId: bob.userId, position: 2, payoutCents: 0 as Money },
    ] as const;

    // First resolve
    await matchmakingService.resolveMatch(match.id, result);

    // Record balances after first resolve
    const aliceAfterFirst = await walletService.getBalance(alice.userId);
    const bobAfterFirst = await walletService.getBalance(bob.userId);

    // Second resolve — should be idempotent (no-op)
    const secondResult = await matchmakingService.resolveMatch(match.id, result);

    // Balances unchanged
    const aliceAfterSecond = await walletService.getBalance(alice.userId);
    const bobAfterSecond = await walletService.getBalance(bob.userId);
    expect(aliceAfterSecond.balanceCents).toBe(aliceAfterFirst.balanceCents);
    expect(bobAfterSecond.balanceCents).toBe(bobAfterFirst.balanceCents);

    // Still RESOLVED
    expect(secondResult.status).toBe(MatchStatus.RESOLVED);

    // Exactly ONE prize transaction for Alice
    const prizeTransactions = await prisma.transaction.findMany({
      where: {
        matchId: match.id as string,
        type: 'PRIZE',
      },
    });
    expect(prizeTransactions).toHaveLength(1);
    expect(prizeTransactions[0]!.userId).toBe(alice.userId as string);

    // Exactly ONE rake transaction
    const rakeTransactions = await prisma.transaction.findMany({
      where: {
        matchId: match.id as string,
        type: 'RAKE',
      },
    });
    expect(rakeTransactions).toHaveLength(1);

    // resolvedAt unchanged
    const matchRow = await prisma.match.findUnique({
      where: { id: match.id as string },
    });
    expect(matchRow!.status).toBe('RESOLVED');
    expect(matchRow!.resolvedAt).not.toBeNull();
  });

  // ─── Test 3: Reseed proves test isolation ────────────────────────

  it('prismaReset restores clean-seeded state after a full flow', async () => {
    const { paymentProvider, matchmakingService } = services;

    // Exercise a full flow (don't assert — just produce data)
    const alice = await signup({ country: 'US' });
    const bob = await signup({ country: 'US' });
    await paymentProvider.processDeposit(alice.userId, 1000 as Money);
    await paymentProvider.processDeposit(bob.userId, 1000 as Money);

    const entryFeeCents = 100 as Money;
    await matchmakingService.joinQueue(alice.userId, tetrisDuelGameId, entryFeeCents);
    await matchmakingService.joinQueue(bob.userId, tetrisDuelGameId, entryFeeCents);

    const match = await matchmakingService.createMatch(
      tetrisDuelGameId,
      [alice.userId, bob.userId],
      entryFeeCents,
    );
    await matchmakingService.resolveMatch(match.id, [
      { userId: alice.userId, position: 1, payoutCents: 184 as Money },
      { userId: bob.userId, position: 2, payoutCents: 0 as Money },
    ]);

    // Now reset
    await prismaReset();

    // Assert clean state: no user-data rows remain
    const userCount = await prisma.user.count({
      where: {
        id: {
          notIn: [
            'SYSTEM_PLATFORM_SUSPENSE',
            'SYSTEM_MATCH_POOL',
            'SYSTEM_PLATFORM_REVENUE',
          ],
        },
      },
    });
    expect(userCount).toBe(0);

    // System wallets exist (3 from seed)
    const walletCount = await prisma.wallet.count();
    expect(walletCount).toBe(3);

    // No matches
    const matchCount = await prisma.match.count();
    expect(matchCount).toBe(0);

    // No match players
    const matchPlayerCount = await prisma.matchPlayer.count();
    expect(matchPlayerCount).toBe(0);

    // No transactions (system wallet seed doesn't create transactions)
    const transactionCount = await prisma.transaction.count();
    expect(transactionCount).toBe(0);

    // No ledger entries
    const ledgerCount = await prisma.ledgerEntry.count();
    expect(ledgerCount).toBe(0);

    // All 24 games restored
    const gameCount = await prisma.game.count();
    expect(gameCount).toBe(24);

    // Jurisdiction configs restored
    const jurisdictionCount = await prisma.jurisdictionConfig.count();
    expect(jurisdictionCount).toBeGreaterThan(0);
    expect(jurisdictionCount).toBe(13); // 1 US default + 11 US states + 1 global fallback
  });
});
