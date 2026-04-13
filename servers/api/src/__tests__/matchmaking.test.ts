import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '@arena/shared';
import { authHeader, createTestContext } from './helpers.js';

describe('matchmaking routes', () => {
  it('POST /matchmaking/queue performs compliance checks and queues the user', async () => {
    const context = createTestContext();
    context.prisma.game.findUnique.mockResolvedValue({
      id: 'game-1',
      tier: 'TIER_2',
      isEnabled: true,
    });

    const response = await request(context.app)
      .post('/matchmaking/queue')
      .set('Authorization', authHeader())
      .send({
        gameId: 'game-1',
        entryFeeCents: 100,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      queued: true,
      gameId: 'game-1',
      entryFeeCents: 100,
    });
    expect(context.matchmakingService.joinQueue).toHaveBeenCalledWith('user-1', 'game-1', 100);
  });

  it('POST /matchmaking/queue blocks jurisdiction failures before queueing', async () => {
    const context = createTestContext();
    context.geoService.checkJurisdiction = context.geoService.checkJurisdiction
      .mockResolvedValue(false);

    const response = await request(context.app)
      .post('/matchmaking/queue')
      .set('Authorization', authHeader())
      .send({
        gameId: 'game-1',
        entryFeeCents: 100,
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('INVALID_STATE');
    expect(response.body.message).toBe('jurisdiction blocked');
    expect(context.matchmakingService.joinQueue).not.toHaveBeenCalled();
  });

  it('POST /matchmaking/queue blocks disallowed tiers before queueing', async () => {
    const context = createTestContext();
    context.prisma.game.findUnique.mockResolvedValue({
      id: 'game-1',
      tier: 'TIER_3',
      isEnabled: true,
    });

    const response = await request(context.app)
      .post('/matchmaking/queue')
      .set('Authorization', authHeader())
      .send({
        gameId: 'game-1',
        entryFeeCents: 100,
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('INVALID_STATE');
    expect(response.body.message).toBe('game tier not permitted in jurisdiction');
    expect(context.matchmakingService.joinQueue).not.toHaveBeenCalled();
  });

  it('POST /matchmaking/queue blocks when age verification is required', async () => {
    const context = createTestContext();
    context.prisma.game.findUnique.mockResolvedValue({
      id: 'game-1',
      tier: 'TIER_2',
      isEnabled: true,
    });
    context.kycService.checkAge = context.kycService.checkAge.mockResolvedValue(false);

    const response = await request(context.app)
      .post('/matchmaking/queue')
      .set('Authorization', authHeader())
      .send({
        gameId: 'game-1',
        entryFeeCents: 100,
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('INVALID_STATE');
    expect(response.body.message).toBe('age verification required');
    expect(context.matchmakingService.joinQueue).not.toHaveBeenCalled();
  });

  it('DELETE /matchmaking/queue leaves the queue idempotently', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .delete('/matchmaking/queue')
      .set('Authorization', authHeader())
      .send({ gameId: 'game-1' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ dequeued: true });
    expect(context.matchmakingService.leaveQueue).toHaveBeenCalledWith('user-1', 'game-1');
  });

  it('POST /matchmaking/dev/create-match retries ConflictError and returns the created match', async () => {
    const context = createTestContext();
    context.matchmakingService.createMatch = context.matchmakingService.createMatch
      .mockRejectedValueOnce(new ConflictError('retry me'))
      .mockResolvedValueOnce({
        id: 'match-1',
        gameId: 'game-1',
        status: 'IN_PROGRESS',
        entryFeeCents: 100,
        prizePoolCents: 184,
        rakeCents: 16,
        result: null,
        startedAt: '2026-04-12T00:00:00.000Z',
        endedAt: null,
      });

    const response = await request(context.app)
      .post('/matchmaking/dev/create-match')
      .set('Authorization', authHeader())
      .send({
        gameId: 'game-1',
        playerIds: ['user-1', 'user-2'],
        entryFeeCents: 100,
      });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('match-1');
    expect(context.matchmakingService.createMatch).toHaveBeenCalledTimes(2);
  });

  it('POST /matchmaking/dev/create-match returns 404 when dev endpoints are disabled', async () => {
    const context = createTestContext({
      enableDevEndpoints: false,
    });

    const response = await request(context.app)
      .post('/matchmaking/dev/create-match')
      .set('Authorization', authHeader())
      .send({
        gameId: 'game-1',
        playerIds: ['user-1', 'user-2'],
        entryFeeCents: 100,
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NOT_FOUND');
  });

  it('POST /matchmaking/dev/resolve-match returns the resolved match', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .post('/matchmaking/dev/resolve-match')
      .set('Authorization', authHeader())
      .send({
        matchId: 'match-1',
        result: [
          { userId: 'user-1', position: 1 },
          { userId: 'user-2', position: 2 },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('RESOLVED');
    expect(context.matchmakingService.resolveMatch).toHaveBeenCalledWith(
      'match-1',
      [
        { userId: 'user-1', position: 1, payoutCents: 0 },
        { userId: 'user-2', position: 2, payoutCents: 0 },
      ],
    );
  });

  it('GET /matchmaking/rating returns the player rating', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .get('/matchmaking/rating?gameId=game-1')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: 'user-1',
      gameId: 'game-1',
      elo: 1200,
    });
  });
});
