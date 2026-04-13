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
} from './helpers.js';

const USER_ID = 'user-disconnect' as UserId;
const MATCH_ID = 'match-disconnect' as MatchId;

describe('disconnect handling', () => {
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

  it('cancels the leave timer when the same user rejoins the same match within grace', async () => {
    const context = await createTestGatewayContext({ reconnectGraceMs: 100 });
    contexts.push(context);
    seedMatch(context, MATCH_ID, [USER_ID], { counter: 0 });

    const firstClient = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(firstClient);

    const firstJoin = await emitJoinMatch(firstClient, { matchId: MATCH_ID });
    expect(firstJoin).toMatchObject({ ok: true });

    firstClient.close();
    clients.splice(clients.indexOf(firstClient), 1);

    await wait(25);

    const secondClient = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(secondClient);

    const secondJoin = await emitJoinMatch(secondClient, { matchId: MATCH_ID });
    expect(secondJoin).toMatchObject({ ok: true });

    await wait(125);

    expect(context.host.handlePlayerLeave).not.toHaveBeenCalled();
  });

  it('calls host.handlePlayerLeave after the grace window expires', async () => {
    const context = await createTestGatewayContext({ reconnectGraceMs: 75 });
    contexts.push(context);
    seedMatch(context, MATCH_ID, [USER_ID], { counter: 0 });

    const client = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(client);

    const joinResponse = await emitJoinMatch(client, { matchId: MATCH_ID });
    expect(joinResponse).toMatchObject({ ok: true });

    client.close();
    clients.splice(clients.indexOf(client), 1);

    await wait(125);

    expect(context.host.handlePlayerLeave).toHaveBeenCalledWith(MATCH_ID, USER_ID);
  });
});
