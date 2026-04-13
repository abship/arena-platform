import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '@arena/shared';
import { authHeader, createTestContext } from './helpers.js';

describe('wallet routes', () => {
  it('GET /wallet/balance returns the wallet balance', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .get('/wallet/balance')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(response.body.balanceCents).toBe(5000);
    expect(context.walletService.getBalance).toHaveBeenCalledWith('user-1');
  });

  it('POST /wallet/deposit returns the deposit result', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .post('/wallet/deposit')
      .set('Authorization', authHeader())
      .send({ amountCents: 2500 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      reference: 'deposit-ref-1',
      amountCents: 2500,
    });
    expect(context.paymentProvider.processDeposit).toHaveBeenCalledWith('user-1', 2500);
  });

  it('POST /wallet/deposit validates the request body', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .post('/wallet/deposit')
      .set('Authorization', authHeader())
      .send({ amountCents: 0 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('POST /wallet/deposit retries ConflictError and succeeds on the next attempt', async () => {
    const context = createTestContext();
    context.paymentProvider.processDeposit = context.paymentProvider.processDeposit
      .mockRejectedValueOnce(new ConflictError('retry me'))
      .mockResolvedValueOnce({
        success: true,
        reference: 'deposit-ref-2',
        amountCents: 2500,
      });

    const response = await request(context.app)
      .post('/wallet/deposit')
      .set('Authorization', authHeader())
      .send({ amountCents: 2500 });

    expect(response.status).toBe(200);
    expect(response.body.reference).toBe('deposit-ref-2');
    expect(context.paymentProvider.processDeposit).toHaveBeenCalledTimes(2);
  });

  it('POST /wallet/deposit returns 409 with Retry-After when ConflictError retries are exhausted', async () => {
    const context = createTestContext();
    context.paymentProvider.processDeposit = context.paymentProvider.processDeposit
      .mockRejectedValue(new ConflictError('still conflicting'));

    const response = await request(context.app)
      .post('/wallet/deposit')
      .set('Authorization', authHeader())
      .send({ amountCents: 2500 });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('CONFLICT');
    expect(response.headers['retry-after']).toBe('1');
    expect(context.paymentProvider.processDeposit).toHaveBeenCalledTimes(4);
  });

  it('GET /wallet/transactions returns paginated transaction history', async () => {
    const context = createTestContext();
    context.walletService.getTransactionHistory = context.walletService.getTransactionHistory
      .mockResolvedValue({
        items: [
          {
            id: 'tx-1',
            walletId: 'wallet-1',
            type: 'DEPOSIT',
            amountCents: 2500,
            status: 'COMPLETED',
            matchId: null,
            reference: 'deposit-ref-1',
            createdAt: new Date('2026-04-12T00:00:00.000Z'),
          },
        ],
        total: 1,
      });

    const response = await request(context.app)
      .get('/wallet/transactions?offset=5&limit=10')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(context.walletService.getTransactionHistory).toHaveBeenCalledWith('user-1', {
      offset: 5,
      limit: 10,
    });
  });

  it('GET /wallet/transactions validates query parameters', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .get('/wallet/transactions?limit=101')
      .set('Authorization', authHeader());

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});
