import { afterEach, describe, expect, it } from 'vitest';
import type { MatchId, UserId } from '@arena/shared';
import {
  cleanupTestContext,
  connectClient,
  createTestGatewayContext,
  emitJoinMatch,
  seedMatch,
  signTestToken,
} from './helpers.js';

const USER_ID = 'user-join' as UserId;
const OTHER_USER_ID = 'user-other' as UserId;
const MATCH_ID = 'match-join' as MatchId;
const UNKNOWN_MATCH_ID = 'match-unknown' as MatchId;

describe('join-match', () => {
  const contexts: Awaited<ReturnType<typeof createTestGatewayContext>>[] = [];
  const clients: Awaited<ReturnType<typeof connectClient>>[] = [];

  afterEach(async () => {
    while (contexts.length > 0) {
      const context = contexts.pop();
      if (!context) {
        continue;
      }

      await cleanupTestContext(context, clients.splice(0));
    }
  });

  it('acks with current state when the authenticated user belongs to the match', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);
    seedMatch(context, MATCH_ID, [USER_ID], { counter: 3 });

    const client = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(client);

    const response = await emitJoinMatch(client, { matchId: MATCH_ID });

    expect(response).toEqual({
      ok: true,
      state: { counter: 3 },
    });
  });

  it('rejects a known match when the user is not one of its players', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);
    seedMatch(context, MATCH_ID, [OTHER_USER_ID], { counter: 0 });

    const client = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(client);

    const response = await emitJoinMatch(client, { matchId: MATCH_ID });

    expect(response).toMatchObject({
      ok: false,
      error: 'VALIDATION_ERROR',
      message: 'User is not a player in this match',
    });
  });

  it('rejects an unknown matchId', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);

    const client = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(client);

    const response = await emitJoinMatch(client, { matchId: UNKNOWN_MATCH_ID });

    expect(response).toMatchObject({
      ok: false,
      error: 'NOT_FOUND',
      message: 'Match not found or not yet created',
    });
  });
});
