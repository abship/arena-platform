import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '@arena/shared';
import { authHeader, createTestContext } from './helpers.js';

describe('error handler', () => {
  it('maps AppError subclasses to their expected HTTP responses', async () => {
    const context = createTestContext();
    context.walletService.getBalance = context.walletService.getBalance
      .mockRejectedValue(new NotFoundError('Wallet not found', { userId: 'user-1' }));

    const response = await request(context.app)
      .get('/wallet/balance')
      .set('Authorization', authHeader());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'NOT_FOUND',
      message: 'Wallet not found',
      context: { userId: 'user-1' },
    });
  });

  it('returns INTERNAL_ERROR for unexpected failures', async () => {
    const context = createTestContext();
    context.walletService.getBalance = context.walletService.getBalance
      .mockRejectedValue(new Error('database exploded'));

    const response = await request(context.app)
      .get('/wallet/balance')
      .set('Authorization', authHeader());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'INTERNAL_ERROR',
    });
  });
});
