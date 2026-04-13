import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  authHeader,
  createTestContext,
  signExpiredTestToken,
} from './helpers.js';

describe('auth middleware', () => {
  it('returns 401 when the token is missing', async () => {
    const context = createTestContext();

    const response = await request(context.app).get('/users/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('returns 401 when the token is invalid', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .get('/users/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('returns 401 when the token is expired', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .get('/users/me')
      .set('Authorization', `Bearer ${signExpiredTestToken()}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('allows valid tokens through to protected handlers', async () => {
    const context = createTestContext();
    context.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'player@example.com',
      username: 'player1',
      verificationLevel: 'LEVEL_2',
      country: 'US',
      region: 'CA',
      createdAt: new Date('2026-04-12T00:00:00.000Z'),
    });

    const response = await request(context.app)
      .get('/users/me')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(response.body.userId).toBe('user-1');
  });
});
