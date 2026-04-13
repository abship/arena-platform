import { afterEach, describe, expect, it, vi } from 'vitest';
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

const USER_ID = 'user-gateway' as UserId;
const MATCH_ID = 'match-gateway' as MatchId;

describe('createWebsocketGateway', () => {
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

  it('shutdown unsubscribes broadcaster listeners, cancels pending leaves, and closes sockets', async () => {
    const context = await createTestGatewayContext({ reconnectGraceMs: 500 });
    contexts.push(context);
    seedMatch(context, MATCH_ID, [USER_ID], { counter: 0 });

    const client = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(client);

    const joinResponse = await emitJoinMatch(client, { matchId: MATCH_ID });
    expect(joinResponse).toMatchObject({ ok: true });

    const toSpy = vi.spyOn(context.gateway, 'to');

    context.broadcaster.emitState(MATCH_ID, { counter: 1 });
    expect(toSpy).toHaveBeenCalledTimes(1);

    const disconnected = new Promise<string>((resolve) => {
      client.once('disconnect', (reason) => {
        resolve(reason);
      });
    });

    client.close();
    clients.splice(clients.indexOf(client), 1);

    await disconnected;
    await context.gateway.shutdown();

    context.broadcaster.emitState(MATCH_ID, { counter: 2 });
    await wait(550);

    expect(toSpy).toHaveBeenCalledTimes(1);
    expect(context.host.handlePlayerLeave).not.toHaveBeenCalled();
    expect(context.httpServer.listening).toBe(false);

    contexts.pop();
    await wait(25);
  });
});
