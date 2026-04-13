import { afterEach, describe, expect, it } from 'vitest';
import type { MatchId, UserId } from '@arena/shared';
import {
  cleanupTestContext,
  connectClient,
  createTestGatewayContext,
  emitJoinMatch,
  seedMatch,
  signTestToken,
  wait,
  waitForEvent,
} from './helpers.js';

const USER_ID = 'user-input' as UserId;
const MATCH_ID = 'match-input' as MatchId;

describe('player-input', () => {
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

  it('routes player input to host.handleInput with the authenticated userId', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);
    seedMatch(context, MATCH_ID, [USER_ID], { counter: 1 });

    const client = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(client);

    const joinResponse = await emitJoinMatch(client, { matchId: MATCH_ID });
    expect(joinResponse).toMatchObject({ ok: true });

    client.emit('player-input', {
      matchId: MATCH_ID,
      input: { direction: 'up' },
    });

    await wait(50);

    expect(context.host.handleInput).toHaveBeenCalledWith(MATCH_ID, USER_ID, {
      direction: 'up',
    });
  });

  it('rejects input when the socket has not joined the match room', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);
    seedMatch(context, MATCH_ID, [USER_ID], { counter: 1 });

    const client = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(client);

    client.emit('player-input', {
      matchId: MATCH_ID,
      input: { direction: 'left' },
    });

    const error = await waitForEvent(client, 'gateway-error');

    expect(error).toEqual({
      error: 'VALIDATION_ERROR',
      message: 'Socket has not joined this match',
      context: {
        matchId: MATCH_ID,
        userId: USER_ID,
      },
    });
    expect(context.host.handleInput).not.toHaveBeenCalled();
  });
});
