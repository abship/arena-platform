import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

describe('games routes', () => {
  it('GET /games returns enabled games ordered by name', async () => {
    const context = createTestContext();
    context.prisma.game.findMany.mockResolvedValue([
      {
        id: 'game-2',
        slug: 'agario',
        name: 'Agar.io',
        tier: 'TIER_2',
        engineClass: 'REAL_TIME_CONTINUOUS',
        moneyModel: 'PROGRESSIVE_POOL',
        minPlayers: 2,
        maxPlayers: 50,
        entryFeeCents: 10n,
        isEnabled: true,
        createdAt: new Date('2026-04-12T00:00:00.000Z'),
        updatedAt: new Date('2026-04-12T00:00:00.000Z'),
      },
    ]);

    const response = await request(context.app).get('/games');

    expect(response.status).toBe(200);
    expect(response.body.games).toEqual([
      {
        id: 'game-2',
        slug: 'agario',
        name: 'Agar.io',
        tier: 'TIER_2',
        engineClass: 'REAL_TIME_CONTINUOUS',
        moneyModel: 'PROGRESSIVE_POOL',
        minPlayers: 2,
        maxPlayers: 50,
        entryFeeCents: '10',
        isEnabled: true,
        createdAt: '2026-04-12T00:00:00.000Z',
        updatedAt: '2026-04-12T00:00:00.000Z',
      },
    ]);
    expect(context.prisma.game.findMany).toHaveBeenCalledWith({
      where: { isEnabled: true },
      orderBy: { name: 'asc' },
    });
  });
});
