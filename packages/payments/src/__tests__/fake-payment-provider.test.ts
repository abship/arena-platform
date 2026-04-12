import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WalletService } from '@arena/shared';
import type { UserId, Money } from '@arena/shared';
import { FakePaymentProvider } from '../fake-payment-provider.js';
import { createPaymentProvider } from '../payment-provider-factory.js';

/** Helper to create a mock WalletService with vi.fn() stubs. */
function createMockWalletService(): WalletService {
  return {
    deposit: vi.fn().mockResolvedValue({ id: 'tx-1' }),
    withdraw: vi.fn().mockResolvedValue({ id: 'tx-2' }),
    deductEntryFee: vi.fn().mockResolvedValue({ id: 'tx-3' }),
    awardPrize: vi.fn().mockResolvedValue({ id: 'tx-4' }),
    collectRake: vi.fn().mockResolvedValue({ id: 'tx-5' }),
    getBalance: vi.fn().mockResolvedValue({ balanceCents: 0 }),
    getTransactionHistory: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  } as unknown as WalletService;
}

const TEST_USER_ID = 'user-abc-123' as UserId;
const OTHER_USER_ID = 'user-xyz-456' as UserId;
const AMOUNT = 500 as Money; // $5.00

describe('FakePaymentProvider', () => {
  let wallet: WalletService;
  let provider: FakePaymentProvider;

  beforeEach(() => {
    wallet = createMockWalletService();
    provider = new FakePaymentProvider(wallet);
  });

  describe('processDeposit', () => {
    it('returns success with a unique reference and correct amountCents', async () => {
      const result = await provider.processDeposit(TEST_USER_ID, AMOUNT);

      expect(result.success).toBe(true);
      expect(result.amountCents).toBe(AMOUNT);
      expect(result.reference).toMatch(/^fake-deposit-/);
    });

    it('calls walletService.deposit exactly once with expected args', async () => {
      const result = await provider.processDeposit(TEST_USER_ID, AMOUNT);

      expect(wallet.deposit).toHaveBeenCalledTimes(1);
      expect(wallet.deposit).toHaveBeenCalledWith(
        TEST_USER_ID,
        AMOUNT,
        'fake-payment-provider',
        result.reference,
      );
    });

    it('propagates errors from walletService.deposit', async () => {
      const error = new Error('ConflictError: duplicate reference');
      vi.mocked(wallet.deposit).mockRejectedValueOnce(error);

      await expect(provider.processDeposit(TEST_USER_ID, AMOUNT)).rejects.toThrow(
        'ConflictError: duplicate reference',
      );
    });

    it('generates 100 distinct references for the same user', async () => {
      const references = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = await provider.processDeposit(TEST_USER_ID, AMOUNT);
        references.add(result.reference);
      }
      expect(references.size).toBe(100);
    });
  });

  describe('processWithdrawal', () => {
    it('returns success with a unique reference and correct amountCents', async () => {
      const result = await provider.processWithdrawal(TEST_USER_ID, AMOUNT);

      expect(result.success).toBe(true);
      expect(result.amountCents).toBe(AMOUNT);
      expect(result.reference).toMatch(/^fake-withdrawal-/);
    });

    it('calls walletService.withdraw exactly once with expected args', async () => {
      const result = await provider.processWithdrawal(TEST_USER_ID, AMOUNT);

      expect(wallet.withdraw).toHaveBeenCalledTimes(1);
      expect(wallet.withdraw).toHaveBeenCalledWith(
        TEST_USER_ID,
        AMOUNT,
        'fake-payment-provider',
        result.reference,
      );
    });

    it('propagates errors from walletService.withdraw', async () => {
      const error = new Error('InsufficientFundsError');
      vi.mocked(wallet.withdraw).mockRejectedValueOnce(error);

      await expect(provider.processWithdrawal(TEST_USER_ID, AMOUNT)).rejects.toThrow(
        'InsufficientFundsError',
      );
    });
  });

  describe('getDepositAddress', () => {
    it('returns the same address for the same userId across calls', async () => {
      const addr1 = await provider.getDepositAddress(TEST_USER_ID);
      const addr2 = await provider.getDepositAddress(TEST_USER_ID);
      const addr3 = await provider.getDepositAddress(TEST_USER_ID);

      expect(addr1).toBe(addr2);
      expect(addr2).toBe(addr3);
    });

    it('returns different addresses for different userIds', async () => {
      const addr1 = await provider.getDepositAddress(TEST_USER_ID);
      const addr2 = await provider.getDepositAddress(OTHER_USER_ID);

      expect(addr1).not.toBe(addr2);
    });

    it('returns a string containing the userId', async () => {
      const addr = await provider.getDepositAddress(TEST_USER_ID);
      expect(addr).toBe(`fake-address-${TEST_USER_ID}`);
    });
  });
});

describe('PaymentProviderFactory', () => {
  let wallet: WalletService;

  beforeEach(() => {
    wallet = createMockWalletService();
  });

  it('returns FakePaymentProvider by default (no provider specified)', () => {
    const provider = createPaymentProvider({ walletService: wallet });
    expect(provider).toBeInstanceOf(FakePaymentProvider);
  });

  it('returns FakePaymentProvider when provider is explicitly "fake"', () => {
    const provider = createPaymentProvider({ provider: 'fake', walletService: wallet });
    expect(provider).toBeInstanceOf(FakePaymentProvider);
  });

  it('throws for unknown provider names', () => {
    expect(() =>
      createPaymentProvider({ provider: 'stripe', walletService: wallet }),
    ).toThrow(/Unknown payment provider "stripe"/);
  });
});
