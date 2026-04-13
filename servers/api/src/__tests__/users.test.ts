import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '@arena/shared';
import { authHeader, createTestContext } from './helpers.js';

describe('users routes', () => {
  it('GET /users/me returns the authenticated user profile', async () => {
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
    expect(response.body).toEqual({
      userId: 'user-1',
      email: 'player@example.com',
      username: 'player1',
      verificationLevel: 'LEVEL_2',
      country: 'US',
      region: 'CA',
      createdAt: '2026-04-12T00:00:00.000Z',
    });
  });

  it('GET /users/me maps missing users to NOT_FOUND', async () => {
    const context = createTestContext();
    context.prisma.user.findUnique.mockResolvedValue(null);

    const response = await request(context.app)
      .get('/users/me')
      .set('Authorization', authHeader());

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NOT_FOUND');
  });
});
